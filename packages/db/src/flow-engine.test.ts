import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbSingletonForTests,
  customers,
  dispatchStep,
  flowExecutions,
  getBootstrappedDb,
  ingestOrderPaidEvent,
  planPostPurchaseFlow,
  processDueJobs,
  seedDefaultFlowsForShop,
  shops,
  type ChannelProviders,
} from "./index";

const TEST_SHOP = "flow-test.myshopify.com";

function makeRecordingProviders() {
  const sent: Array<{ channel: string; body: string }> = [];
  const make =
    (channel: "whatsapp" | "sms" | "email") =>
    async ({ body }: { body: string }) => {
      sent.push({ channel, body });
      return { providerMessageId: `${channel}_x` };
    };
  const providers: ChannelProviders = {
    whatsapp: make("whatsapp"),
    sms: make("sms"),
    email: make("email"),
  };
  return { providers, sent };
}

describe("flow engine", () => {
  beforeEach(async () => {
    process.env.PGLITE_MEMORY = "1";
    delete process.env.DATABASE_URL;
    process.env.RETAINIQ_POST_PURCHASE_DELAY_MS = "5";
    process.env.RETAINIQ_FLOW_DELAY_SCALE = "0";
    __resetDbSingletonForTests();
    const db = await getBootstrappedDb();
    const [shop] = await db
      .insert(shops)
      .values({
        shopifyDomain: TEST_SHOP,
        accessToken: "tok",
      })
      .returning({ id: shops.id });
    await seedDefaultFlowsForShop(db, shop!.id);
  });

  afterEach(() => {
    delete process.env.RETAINIQ_FLOW_DELAY_SCALE;
    __resetDbSingletonForTests();
  });

  it("schedules eligible steps for an at-risk customer", async () => {
    const db = await getBootstrappedDb();
    await ingestOrderPaidEvent(db, TEST_SHOP, {
      id: 7001,
      currency: "USD",
      total_price: "9.00",
      discount_codes: [{ code: "SAVE10" }],
      customer: { id: 42, email: "buyer@example.com" },
      line_items: [{ title: "Drip Coffee", quantity: 1, price: "9.00" }],
    });

    const [cust] = await db
      .select({ id: customers.id, optInEmail: customers.optInEmail })
      .from(customers);
    expect(cust?.optInEmail).toBe(true);

    const [order] = await db
      .select({ id: customers.id })
      .from(customers)
      .limit(1);
    expect(order).toBeDefined();

    const [shop] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(eq(shops.shopifyDomain, TEST_SHOP))
      .limit(1);

    const orders = await db
      .select({ id: flowExecutions.id })
      .from(flowExecutions);
    expect(orders.length).toBe(0);

    const { scheduled } = await planPostPurchaseFlow(db, {
      shopId: shop!.id,
      orderId: (
        await db
          .select({ id: customers.id })
          .from(customers)
          .limit(1)
      )[0]!.id,
    });

    expect(scheduled).toBe(0);
  });

  it("end-to-end: ingest → post-purchase job → dispatch-step renders", async () => {
    const db = await getBootstrappedDb();
    const { providers, sent } = makeRecordingProviders();

    await ingestOrderPaidEvent(db, TEST_SHOP, {
      id: 7002,
      currency: "USD",
      total_price: "9.00",
      discount_codes: [{ code: "SAVE10" }],
      customer: { id: 43, email: "buyer2@example.com" },
      line_items: [{ title: "Drip Coffee", quantity: 1, price: "9.00" }],
    });

    await new Promise((r) => setTimeout(r, 30));

    const handlers = {
      "post-purchase": async (payload: Record<string, unknown>) => {
        await planPostPurchaseFlow(db, {
          shopId: String(payload.shopId),
          orderId: String(payload.orderId),
        });
      },
      "dispatch-step": async (payload: Record<string, unknown>) => {
        await dispatchStep(db, providers, payload);
      },
    };

    let total = 0;
    for (let i = 0; i < 10; i++) {
      total += await processDueJobs(db, handlers, { limit: 100 });
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(total).toBeGreaterThan(0);

    const execs = await db.select().from(flowExecutions);
    expect(execs.length).toBeGreaterThan(0);
    expect(execs.every((e) => e.status === "sent")).toBe(true);
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) {
      expect(m.body).not.toMatch(/\{\{/);
    }
  });

  it("renders no unfilled template variables", async () => {
    const db = await getBootstrappedDb();
    const { providers, sent } = makeRecordingProviders();

    await ingestOrderPaidEvent(db, TEST_SHOP, {
      id: 7003,
      currency: "USD",
      total_price: "50.00",
      customer: { id: 44, email: "buyer3@example.com" },
      line_items: [{ title: "Collagen", quantity: 1, price: "50.00" }],
    });

    await new Promise((r) => setTimeout(r, 30));

    for (let i = 0; i < 5; i++) {
      await processDueJobs(db, {
        "post-purchase": async (payload) => {
          await planPostPurchaseFlow(db, {
            shopId: String(payload.shopId),
            orderId: String(payload.orderId),
          });
        },
        "dispatch-step": async (payload) => {
          await dispatchStep(db, providers, payload);
        },
      });
    }

    for (const m of sent) {
      expect(m.body).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    }
  });
});
