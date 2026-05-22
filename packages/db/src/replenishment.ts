/**
 * Phase-2 replenishment model (PRD §5.3).
 *
 * Production target is a per-customer×SKU Weibull-Gamma Bayesian mixture
 * (PRD §10.2). This is a pragmatic stand-in: empirical median of observed
 * inter-purchase intervals, shrunk toward a category prior with a strength
 * that grows with sample size. Returns the predicted next reorder date
 * and a ±uncertainty band that narrows with each new observation — same
 * shape the API surfaces today and the LightGBM/PyMC service will surface
 * tomorrow.
 */

import { and, asc, eq } from "drizzle-orm";
import type { DrizzleDb } from "./create-db";
import { customers } from "./schema/customers";
import { orders } from "./schema/orders";
import { enqueueJob } from "./job-queue";

const DEFAULT_PRIOR_DAYS = 35;
const PRIOR_WEIGHT = 2;
const ADVANCE_NOTICE_DAYS = 3;

export type SkuOrderHistory = {
  sku: string;
  title: string;
  timestamps: Date[];
};

export type ReorderPrediction = {
  sku: string;
  title: string;
  lastOrderedAt: Date;
  predictedAt: Date;
  uncertaintyLowerAt: Date;
  uncertaintyUpperAt: Date;
  meanIntervalDays: number;
  observations: number;
  source: "personal" | "category_prior";
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance =
    nums.reduce((s, n) => s + (n - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

export function predictNextReorder(
  history: SkuOrderHistory,
  priorDays = DEFAULT_PRIOR_DAYS,
): ReorderPrediction | null {
  if (history.timestamps.length === 0) return null;
  const sorted = [...history.timestamps].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  const last = sorted[sorted.length - 1]!;

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = (sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / 86_400_000;
    if (d > 0) intervals.push(d);
  }

  let mean: number;
  let source: "personal" | "category_prior";
  let uncertaintyDays: number;

  if (intervals.length === 0) {
    mean = priorDays;
    source = "category_prior";
    uncertaintyDays = Math.max(7, priorDays * 0.3);
  } else {
    const personal = median(intervals);
    const n = intervals.length;
    mean = (personal * n + priorDays * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT);
    source = "personal";
    const sd = stddev(intervals);
    uncertaintyDays = Math.max(3, sd > 0 ? sd : mean * 0.25) / Math.sqrt(n);
  }

  const predicted = new Date(last.getTime() + mean * 86_400_000);
  return {
    sku: history.sku,
    title: history.title,
    lastOrderedAt: last,
    predictedAt: predicted,
    uncertaintyLowerAt: new Date(
      predicted.getTime() - uncertaintyDays * 86_400_000,
    ),
    uncertaintyUpperAt: new Date(
      predicted.getTime() + uncertaintyDays * 86_400_000,
    ),
    meanIntervalDays: Math.round(mean * 10) / 10,
    observations: intervals.length,
    source,
  };
}

export type ReorderPayload = {
  shopId: string;
  customerId: string;
  sku: string;
  title: string;
  predictedAt: string;
};

export async function recomputeReorderForCustomer(
  db: DrizzleDb,
  customerId: string,
): Promise<ReorderPrediction[]> {
  const customerOrders = await db
    .select({
      lineItems: orders.lineItems,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(asc(orders.createdAt));

  const histories = new Map<string, SkuOrderHistory>();
  for (const o of customerOrders) {
    for (const li of o.lineItems ?? []) {
      const sku = li.skuId;
      if (!sku) continue;
      const h = histories.get(sku) ?? {
        sku,
        title: li.title,
        timestamps: [] as Date[],
      };
      h.timestamps.push(o.createdAt);
      histories.set(sku, h);
    }
  }

  const predictions: ReorderPrediction[] = [];
  const summary: Record<string, string> = {};
  for (const h of Array.from(histories.values())) {
    const p = predictNextReorder(h);
    if (!p) continue;
    predictions.push(p);
    summary[h.sku] = p.predictedAt.toISOString();
  }

  await db
    .update(customers)
    .set({ predictedReorder: summary })
    .where(eq(customers.id, customerId));

  return predictions;
}

export async function scheduleReplenishmentReminders(
  db: DrizzleDb,
  args: { shopId: string; customerId: string },
  predictions: ReorderPrediction[],
  options?: { advanceDays?: number; minLeadMs?: number },
): Promise<{ scheduled: number }> {
  const advance = options?.advanceDays ?? ADVANCE_NOTICE_DAYS;
  const minLead = options?.minLeadMs ?? 60_000;
  const now = Date.now();
  let scheduled = 0;

  for (const p of predictions) {
    if (p.observations < 1) continue;
    const runAt = new Date(p.predictedAt.getTime() - advance * 86_400_000);
    if (runAt.getTime() < now + minLead) continue;

    const payload: ReorderPayload = {
      shopId: args.shopId,
      customerId: args.customerId,
      sku: p.sku,
      title: p.title,
      predictedAt: p.predictedAt.toISOString(),
    };
    await enqueueJob(
      db,
      "replenishment-reminder",
      payload as unknown as Record<string, unknown>,
      runAt,
    );
    scheduled++;
  }
  return { scheduled };
}

export type ForecastRow = {
  customerId: string;
  shopifyCustomerId: string;
  sku: string;
  predictedAt: Date;
};

export async function getReorderForecast(
  db: DrizzleDb,
  options?: { windowDays?: number },
): Promise<ForecastRow[]> {
  const window = options?.windowDays ?? 30;
  const rows = await db
    .select({
      id: customers.id,
      shopifyCustomerId: customers.shopifyCustomerId,
      predictedReorder: customers.predictedReorder,
    })
    .from(customers);

  const horizon = Date.now() + window * 86_400_000;
  const out: ForecastRow[] = [];
  for (const r of rows) {
    const map = (r.predictedReorder ?? {}) as Record<string, string>;
    for (const [sku, iso] of Object.entries(map)) {
      const at = new Date(iso);
      if (Number.isNaN(at.getTime())) continue;
      if (at.getTime() < Date.now() - 86_400_000) continue;
      if (at.getTime() > horizon) continue;
      out.push({
        customerId: r.id,
        shopifyCustomerId: r.shopifyCustomerId,
        sku,
        predictedAt: at,
      });
    }
  }
  out.sort((a, b) => a.predictedAt.getTime() - b.predictedAt.getTime());
  return out;
}
