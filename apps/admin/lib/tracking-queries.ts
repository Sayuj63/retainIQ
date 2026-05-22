import { and, desc, eq, ne, sql } from "drizzle-orm";
import { customers, orders, reviews, shops } from "@retainiq/db";
import { getDb } from "./db";

export type TrackingOrder = {
  id: string;
  shopifyOrderId: string;
  shopDomain: string;
  shopId: string;
  customerId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  fulfillmentStatus: string | null;
  estimatedDelivery: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  aov: string | null;
  currency: string | null;
  lineItems: Array<{ skuId?: string; title: string; qty: number; price: string }>;
};

export async function getTrackingOrder(
  shopDomain: string,
  orderId: string,
): Promise<TrackingOrder | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      id: orders.id,
      shopifyOrderId: orders.shopifyOrderId,
      shopDomain: shops.shopifyDomain,
      shopId: orders.shopId,
      customerId: orders.customerId,
      carrier: orders.carrier,
      trackingNumber: orders.trackingNumber,
      fulfillmentStatus: orders.fulfillmentStatus,
      estimatedDelivery: orders.estimatedDelivery,
      deliveredAt: orders.deliveredAt,
      createdAt: orders.createdAt,
      aov: orders.aov,
      currency: orders.currency,
      lineItems: orders.lineItems,
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(
      and(eq(shops.shopifyDomain, shopDomain), eq(orders.id, orderId)),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    lineItems: row.lineItems ?? [],
  } as TrackingOrder;
}

export type Recommendation = {
  title: string;
  sku: string | null;
  popularity: number;
};

/** Top-N best-selling SKUs across a shop, excluding skus the customer already bought. */
export async function getRecommendations(
  shopId: string,
  exclude: Set<string>,
  limit = 3,
): Promise<Recommendation[]> {
  const db = await getDb();
  const all = await db
    .select({ lineItems: orders.lineItems })
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .limit(500);

  const tally = new Map<string, { title: string; count: number }>();
  for (const r of all) {
    for (const li of r.lineItems ?? []) {
      const key = li.skuId ?? li.title;
      if (exclude.has(key)) continue;
      const cur = tally.get(key) ?? { title: li.title, count: 0 };
      cur.count += li.qty;
      tally.set(key, cur);
    }
  }
  return Array.from(tally.entries())
    .map(([sku, v]) => ({ sku, title: v.title, popularity: v.count }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export async function existingReviewForOrder(orderId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: reviews.id, rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.orderId, orderId))
    .limit(1);
  return row ?? null;
}

export async function getCustomerForTracking(customerId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: customers.id,
      shopifyCustomerId: customers.shopifyCustomerId,
      npsScore: customers.npsScore,
      shopDomain: shops.shopifyDomain,
      shopId: customers.shopId,
    })
    .from(customers)
    .innerJoin(shops, eq(customers.shopId, shops.id))
    .where(eq(customers.id, customerId))
    .limit(1);
  return row ?? null;
}

export async function shopHasOtherActiveOrders(shopId: string, exceptOrderId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(eq(orders.shopId, shopId), ne(orders.id, exceptOrderId)),
    );
  return Number(row?.c ?? 0) > 0;
}

export async function getRecentDeliveredOrders(limit = 6) {
  const db = await getDb();
  return db
    .select({
      id: orders.id,
      shopifyOrderId: orders.shopifyOrderId,
      shopDomain: shops.shopifyDomain,
      carrier: orders.carrier,
      deliveredAt: orders.deliveredAt,
      estimatedDelivery: orders.estimatedDelivery,
      fulfillmentStatus: orders.fulfillmentStatus,
      lineItems: orders.lineItems,
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
