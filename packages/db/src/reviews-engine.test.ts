import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbSingletonForTests,
  customers,
  countPending,
  getBootstrappedDb,
  reviews,
  shops,
  submitNps,
  submitReview,
} from "./index";

async function makeCustomer() {
  const db = await getBootstrappedDb();
  const [shop] = await db
    .insert(shops)
    .values({
      shopifyDomain: "rev-test.myshopify.com",
      accessToken: "tok",
    })
    .returning();
  const [c] = await db
    .insert(customers)
    .values({
      shopId: shop!.id,
      shopifyCustomerId: "1",
    })
    .returning();
  return { db, shop: shop!, customer: c! };
}

describe("review + nps engine", () => {
  beforeEach(() => {
    process.env.PGLITE_MEMORY = "1";
    delete process.env.DATABASE_URL;
    __resetDbSingletonForTests();
  });
  afterEach(() => __resetDbSingletonForTests());

  it("auto-publishes a 5-star review to storefront + google + meta", async () => {
    const { db, customer } = await makeCustomer();
    const result = await submitReview(db, {
      customerId: customer.id,
      rating: 5,
      bodyText: "Loved it.",
    });
    expect(result.publishedTo).toContain("storefront");
    expect(result.publishedTo).toContain("google");
    expect(result.publishedTo).toContain("meta");
    expect(result.routedTo).toBeNull();
    const rows = await db.select().from(reviews);
    expect(rows[0]?.published).toBe(true);
    expect(rows[0]?.sentiment).toBe("positive");
  });

  it("holds a 3-star review and opens a support ticket", async () => {
    const { db, customer } = await makeCustomer();
    const r = await submitReview(db, {
      customerId: customer.id,
      rating: 3,
      bodyText: "Sizing was off.",
    });
    expect(r.publishedTo).toEqual([]);
    expect(r.routedTo).toBe("support_queue");
    expect(r.supportTicketId).toMatch(/^tkt_/);
  });

  it("flags 1-2 star reviews and enqueues a recovery alert", async () => {
    const { db, customer } = await makeCustomer();
    await submitReview(db, {
      customerId: customer.id,
      rating: 1,
      bodyText: "Broken.",
    });
    expect(await countPending(db)).toBe(1);
  });

  it("rejects out-of-range ratings", async () => {
    const { db, customer } = await makeCustomer();
    await expect(
      submitReview(db, { customerId: customer.id, rating: 7 }),
    ).rejects.toThrow(/between 1 and 5/);
  });

  it("classifies NPS into promoter/passive/detractor and enqueues follow-up", async () => {
    const { db, customer } = await makeCustomer();
    const r = await submitNps(db, { customerId: customer.id, score: 10 });
    expect(r.category).toBe("promoter");
    expect(r.followUpQueued).toBe(true);

    const r2 = await submitNps(db, { customerId: customer.id, score: 4 });
    expect(r2.category).toBe("detractor");
    expect(r2.followUpQueued).toBe(true);
  });
});
