import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  customers,
  flowExecutions,
  flows,
  getReorderForecast,
  orders,
  queuedJobs,
  reviews,
  shops,
} from "@retainiq/db";
import { getDb } from "./db";

export type Counts = {
  shops: number;
  customers: number;
  orders: number;
  flows: number;
  pendingJobs: number;
  sentMessages: number;
  failedMessages: number;
  scheduledMessages: number;
};

export async function getCounts(): Promise<Counts> {
  const db = await getDb();
  const [s] = await db.select({ c: sql<number>`count(*)` }).from(shops);
  const [c] = await db.select({ c: sql<number>`count(*)` }).from(customers);
  const [o] = await db.select({ c: sql<number>`count(*)` }).from(orders);
  const [f] = await db.select({ c: sql<number>`count(*)` }).from(flows);
  const [pj] = await db
    .select({ c: sql<number>`count(*)` })
    .from(queuedJobs)
    .where(isNull(queuedJobs.completedAt));
  const [sent] = await db
    .select({ c: sql<number>`count(*)` })
    .from(flowExecutions)
    .where(eq(flowExecutions.status, "sent"));
  const [fail] = await db
    .select({ c: sql<number>`count(*)` })
    .from(flowExecutions)
    .where(eq(flowExecutions.status, "failed"));
  const [sch] = await db
    .select({ c: sql<number>`count(*)` })
    .from(flowExecutions)
    .where(eq(flowExecutions.status, "scheduled"));
  return {
    shops: Number(s?.c ?? 0),
    customers: Number(c?.c ?? 0),
    orders: Number(o?.c ?? 0),
    flows: Number(f?.c ?? 0),
    pendingJobs: Number(pj?.c ?? 0),
    sentMessages: Number(sent?.c ?? 0),
    failedMessages: Number(fail?.c ?? 0),
    scheduledMessages: Number(sch?.c ?? 0),
  };
}

export type SegmentRow = { segment: string; count: number };

export async function getSegmentBreakdown(): Promise<SegmentRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      segment: customers.segment,
      count: sql<number>`count(*)`,
    })
    .from(customers)
    .groupBy(customers.segment);
  return rows.map((r) => ({
    segment: r.segment ?? "unknown",
    count: Number(r.count),
  }));
}

export async function getRecentCustomers(limit = 25) {
  const db = await getDb();
  return db
    .select({
      id: customers.id,
      shopifyCustomerId: customers.shopifyCustomerId,
      segment: customers.segment,
      churnScore: customers.churnScore,
      churnScoreUpdatedAt: customers.churnScoreUpdatedAt,
      orderCount: customers.orderCount,
      lastOrderAt: customers.lastOrderAt,
      optInWhatsapp: customers.optInWhatsapp,
      optInEmail: customers.optInEmail,
      optInSms: customers.optInSms,
      shopDomain: shops.shopifyDomain,
    })
    .from(customers)
    .leftJoin(shops, eq(customers.shopId, shops.id))
    .orderBy(desc(customers.churnScore))
    .limit(limit);
}

export async function getRecentOrders(limit = 25) {
  const db = await getDb();
  return db
    .select({
      id: orders.id,
      shopifyOrderId: orders.shopifyOrderId,
      aov: orders.aov,
      currency: orders.currency,
      discountApplied: orders.discountApplied,
      lineItems: orders.lineItems,
      createdAt: orders.createdAt,
      shopDomain: shops.shopifyDomain,
    })
    .from(orders)
    .leftJoin(shops, eq(orders.shopId, shops.id))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function getFlows() {
  const db = await getDb();
  return db
    .select({
      id: flows.id,
      name: flows.name,
      trigger: flows.trigger,
      isActive: flows.isActive,
      config: flows.config,
      createdAt: flows.createdAt,
      shopDomain: shops.shopifyDomain,
    })
    .from(flows)
    .leftJoin(shops, eq(flows.shopId, shops.id))
    .orderBy(desc(flows.createdAt));
}

export async function getRecentExecutions(limit = 50) {
  const db = await getDb();
  return db
    .select({
      id: flowExecutions.id,
      stepId: flowExecutions.stepId,
      channel: flowExecutions.channel,
      status: flowExecutions.status,
      templateName: flowExecutions.templateName,
      renderedContent: flowExecutions.renderedContent,
      scheduledAt: flowExecutions.scheduledAt,
      sentAt: flowExecutions.sentAt,
      errorCode: flowExecutions.errorCode,
      errorMessage: flowExecutions.errorMessage,
    })
    .from(flowExecutions)
    .orderBy(desc(flowExecutions.scheduledAt))
    .limit(limit);
}

export async function getQueue(limit = 100) {
  const db = await getDb();
  return db
    .select()
    .from(queuedJobs)
    .orderBy(desc(queuedJobs.runAt))
    .limit(limit);
}

export async function getShops() {
  const db = await getDb();
  return db.select().from(shops).orderBy(desc(shops.createdAt));
}

export async function getReplenishmentForecast(windowDays = 30) {
  const db = await getDb();
  return getReorderForecast(db, { windowDays });
}

export async function getReviews(limit = 50) {
  const db = await getDb();
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      bodyText: reviews.bodyText,
      sentiment: reviews.sentiment,
      published: reviews.published,
      publishedTo: reviews.publishedTo,
      routedTo: reviews.routedTo,
      supportTicketId: reviews.supportTicketId,
      createdAt: reviews.createdAt,
      shopDomain: shops.shopifyDomain,
      customerId: reviews.customerId,
    })
    .from(reviews)
    .leftJoin(shops, eq(reviews.shopId, shops.id))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

export async function getReviewStats() {
  const db = await getDb();
  const rows = await db
    .select({
      rating: reviews.rating,
      count: sql<number>`count(*)`,
    })
    .from(reviews)
    .groupBy(reviews.rating);
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) dist[r.rating] = Number(r.count);
  const total = Object.values(dist).reduce((s, n) => s + n, 0);
  const avg =
    total > 0
      ? Object.entries(dist).reduce(
          (s, [k, v]) => s + Number(k) * v,
          0,
        ) / total
      : 0;
  return { distribution: dist, total, avg };
}

export async function getNpsStats() {
  const db = await getDb();
  const rows = await db
    .select({
      score: customers.npsScore,
    })
    .from(customers)
    .where(sql`${customers.npsScore} is not null`);
  let promoters = 0,
    passives = 0,
    detractors = 0;
  for (const r of rows) {
    const s = r.score ?? -1;
    if (s >= 9) promoters++;
    else if (s >= 7) passives++;
    else detractors++;
  }
  const total = rows.length;
  const score =
    total > 0
      ? Math.round(((promoters - detractors) / total) * 100)
      : null;
  return { total, promoters, passives, detractors, score };
}

export async function getAbTestResults() {
  const db = await getDb();
  const rows = await db
    .select({
      flowId: flowExecutions.flowId,
      flowName: flows.name,
      stepId: flowExecutions.stepId,
      variantId: flowExecutions.variantId,
      status: flowExecutions.status,
      count: sql<number>`count(*)`,
    })
    .from(flowExecutions)
    .leftJoin(flows, eq(flowExecutions.flowId, flows.id))
    .where(sql`${flowExecutions.variantId} is not null`)
    .groupBy(
      flowExecutions.flowId,
      flows.name,
      flowExecutions.stepId,
      flowExecutions.variantId,
      flowExecutions.status,
    );

  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    {
      flowName: string | null;
      stepId: string;
      variants: Map<string, { sent: number; failed: number; scheduled: number }>;
    }
  >();
  for (const r of rows) {
    const key = `${r.flowId}::${r.stepId}`;
    const g =
      groups.get(key) ??
      {
        flowName: r.flowName,
        stepId: r.stepId,
        variants: new Map<
          string,
          { sent: number; failed: number; scheduled: number }
        >(),
      };
    const v =
      g.variants.get(r.variantId ?? "—") ?? { sent: 0, failed: 0, scheduled: 0 };
    if (r.status === "sent") v.sent = Number(r.count);
    else if (r.status === "failed") v.failed = Number(r.count);
    else if (r.status === "scheduled") v.scheduled = Number(r.count);
    g.variants.set(r.variantId ?? "—", v);
    groups.set(key, g);
  }
  return Array.from(groups.values());
}

export async function getReplenishmentJobsPending(shopId?: string) {
  const db = await getDb();
  const where = shopId
    ? and(
        eq(queuedJobs.name, "replenishment-reminder"),
        isNull(queuedJobs.completedAt),
      )
    : and(
        eq(queuedJobs.name, "replenishment-reminder"),
        isNull(queuedJobs.completedAt),
      );
  return db.select().from(queuedJobs).where(where).orderBy(queuedJobs.runAt);
}

export async function getCustomerScore(id: string) {
  const db = await getDb();
  const [c] = await db
    .select({
      id: customers.id,
      churnScore: customers.churnScore,
      churnScoreUpdatedAt: customers.churnScoreUpdatedAt,
      churnScoreFeatures: customers.churnScoreFeatures,
      segment: customers.segment,
    })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return c ?? null;
}

export async function optInAllCustomersForShop(shopId: string) {
  const db = await getDb();
  await db
    .update(customers)
    .set({ optInWhatsapp: true, optInSms: true })
    .where(eq(customers.shopId, shopId));
}

export async function markShopUninstalled(domain: string) {
  const db = await getDb();
  await db
    .update(shops)
    .set({ isActive: false })
    .where(eq(shops.shopifyDomain, domain));
}

export async function setFlowActive(id: string, isActive: boolean) {
  const db = await getDb();
  await db.update(flows).set({ isActive }).where(eq(flows.id, id));
}

export async function getCustomerDetail(id: string) {
  const db = await getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) return null;

  const customerOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt))
    .limit(25);

  const journey = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.customerId, id))
    .orderBy(desc(flowExecutions.scheduledAt))
    .limit(50);

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.id, customer.shopId))
    .limit(1);

  return { customer, orders: customerOrders, journey, shop };
}
