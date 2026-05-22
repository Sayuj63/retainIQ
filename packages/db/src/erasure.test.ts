import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbSingletonForTests,
  customers,
  eraseCustomer,
  eraseShop,
  getBootstrappedDb,
  ingestOrderPaidEvent,
  orders,
  seedDefaultFlowsForShop,
  shops,
} from "./index";

const TEST_SHOP = "erase-test.myshopify.com";

describe("erasure (GDPR / DPDP)", () => {
  beforeEach(async () => {
    process.env.PGLITE_MEMORY = "1";
    delete process.env.DATABASE_URL;
    process.env.RETAINIQ_POST_PURCHASE_DELAY_MS = "10000";
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
    await ingestOrderPaidEvent(db, TEST_SHOP, {
      id: 8001,
      currency: "USD",
      total_price: "20.00",
      customer: { id: 99, email: "x@y.com" },
      line_items: [{ title: "Item", quantity: 1, price: "20.00" }],
    });
  });

  afterEach(() => {
    __resetDbSingletonForTests();
  });

  it("deletes the customer, keeps the order with null customer ref", async () => {
    const db = await getBootstrappedDb();
    const { deleted } = await eraseCustomer(db, {
      shopDomain: TEST_SHOP,
      shopifyCustomerId: "99",
    });
    expect(deleted).toBe(1);

    const remaining = await db.select().from(customers);
    expect(remaining.length).toBe(0);

    const remainingOrders = await db.select().from(orders);
    expect(remainingOrders.length).toBe(1);
    expect(remainingOrders[0]!.customerId).toBeNull();
  });

  it("wipes the entire shop on shop/redact", async () => {
    const db = await getBootstrappedDb();
    await eraseShop(db, TEST_SHOP);
    const remaining = await db.select().from(shops);
    expect(remaining.length).toBe(0);
  });
});
