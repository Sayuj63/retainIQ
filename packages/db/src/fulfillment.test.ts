import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbSingletonForTests,
  getBootstrappedDb,
  ingestFulfillmentEvent,
  ingestOrderPaidEvent,
  orders,
  seedDefaultFlowsForShop,
  shops,
} from "./index";

const SHOP = "fulfill-test.myshopify.com";

describe("fulfillment ingest", () => {
  beforeEach(async () => {
    process.env.PGLITE_MEMORY = "1";
    delete process.env.DATABASE_URL;
    process.env.RETAINIQ_POST_PURCHASE_DELAY_MS = "10000";
    __resetDbSingletonForTests();
    const db = await getBootstrappedDb();
    const [shop] = await db
      .insert(shops)
      .values({ shopifyDomain: SHOP, accessToken: "tok" })
      .returning();
    await seedDefaultFlowsForShop(db, shop!.id);
    await ingestOrderPaidEvent(db, SHOP, {
      id: 7777,
      currency: "USD",
      total_price: "20.00",
      customer: { id: 1, email: "x@y.com" },
      line_items: [{ title: "Item", quantity: 1, price: "20.00" }],
    });
  });

  afterEach(() => __resetDbSingletonForTests());

  it("fills tracking + carrier + ETA on orders/fulfilled", async () => {
    const db = await getBootstrappedDb();
    const r = await ingestFulfillmentEvent(db, SHOP, {
      id: 7777,
      fulfillment_status: "fulfilled",
      fulfillments: [
        {
          tracking_number: "1Z999",
          tracking_company: "DHL",
          shipment_status: "in_transit",
          estimated_delivery_at: "2026-06-01T00:00:00Z",
        },
      ],
    });
    expect(r.updated).toBe(1);

    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderId, "7777"))
      .limit(1);
    expect(row?.trackingNumber).toBe("1Z999");
    expect(row?.carrier).toBe("DHL");
    expect(row?.deliveredAt).toBeNull();
    expect(row?.fulfillmentStatus).toBe("in_transit");
  });

  it("marks delivered when shipment_status=delivered", async () => {
    const db = await getBootstrappedDb();
    await ingestFulfillmentEvent(db, SHOP, {
      id: 7777,
      fulfillments: [
        {
          tracking_number: "1Z999",
          tracking_company: "DHL",
          shipment_status: "delivered",
          delivered_at: "2026-05-30T00:00:00Z",
        },
      ],
    });
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderId, "7777"))
      .limit(1);
    expect(row?.deliveredAt).not.toBeNull();
    expect(row?.fulfillmentStatus).toBe("delivered");
  });

  it("ignores fulfillment for unknown order", async () => {
    const db = await getBootstrappedDb();
    const r = await ingestFulfillmentEvent(db, SHOP, {
      id: 9999,
      fulfillments: [{ tracking_number: "X" }],
    });
    expect(r.updated).toBe(0);
  });
});
