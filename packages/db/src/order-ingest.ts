import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDb } from "./create-db";
import { customers } from "./schema/customers";
import { orders } from "./schema/orders";
import { shops } from "./schema/shops";
import { enqueueJob } from "./job-queue";
import {
  recomputeReorderForCustomer,
  scheduleReplenishmentReminders,
} from "./replenishment";
import { scoreCustomer } from "./scoring";

const LineItemSchema = z.object({
  sku: z.string().nullable().optional(),
  title: z.string(),
  quantity: z.number(),
  price: z.string().optional(),
});

export const OrderWebhookSchema = z.object({
  id: z.number(),
  currency: z.string(),
  total_price: z.string(),
  discount_codes: z.array(z.object({ code: z.string() })).optional(),
  customer: z
    .object({
      id: z.number(),
      email: z.string().optional(),
    })
    .nullable()
    .optional(),
  line_items: z.array(LineItemSchema),
});

export type OrderWebhookPayload = z.infer<typeof OrderWebhookSchema>;

function postPurchaseDelayMs(): number {
  const v = process.env.RETAINIQ_POST_PURCHASE_DELAY_MS;
  if (v) return Number.parseInt(v, 10);
  return 2 * 60 * 60 * 1000;
}

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email).digest("hex");
}

export async function ingestOrderPaidEvent(
  db: DrizzleDb,
  shopDomain: string,
  rawPayload: unknown,
): Promise<{ orderRowId: string; customerRowId: string; score: number }> {
  const payload = OrderWebhookSchema.parse(rawPayload);

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopifyDomain, shopDomain))
    .limit(1);

  if (!shop) {
    throw new Error(
      `Unknown shop ${shopDomain}. Complete OAuth install first (/api/auth).`,
    );
  }

  const shopifyCustomerId = payload.customer?.id
    ? String(payload.customer.id)
    : "guest";

  const emailHash =
    payload.customer?.email != null
      ? hashEmail(payload.customer.email)
      : null;

  const [priorCustomer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.shopId, shop.id),
        eq(customers.shopifyCustomerId, shopifyCustomerId),
      ),
    )
    .limit(1);

  const now = new Date();
  const previousOrderCount = priorCustomer?.orderCount ?? 0;
  const lastOrderAt = priorCustomer?.lastOrderAt ?? null;
  const daysSinceLastOrder = lastOrderAt
    ? Math.max(
        0,
        Math.floor((now.getTime() - lastOrderAt.getTime()) / 86_400_000),
      )
    : null;

  const aov = Number(payload.total_price) || 0;
  const brandMedianAov = await computeBrandMedianAov(db, shop.id);

  const scoring = scoreCustomer({
    aov,
    brandMedianAov,
    daysSinceLastOrder,
    orderCount: previousOrderCount + 1,
    discountUsed: Boolean(payload.discount_codes?.length),
  });

  const [customerRow] = await db
    .insert(customers)
    .values({
      shopId: shop.id,
      shopifyCustomerId,
      emailHash,
      orderCount: 1,
      lastOrderAt: now,
      churnScore: scoring.score.toFixed(2),
      churnScoreUpdatedAt: now,
      churnScoreFeatures: { features: scoring.features, action: scoring.action },
      segment: scoring.segment,
    })
    .onConflictDoUpdate({
      target: [customers.shopId, customers.shopifyCustomerId],
      set: {
        orderCount: sql`${customers.orderCount} + 1`,
        lastOrderAt: now,
        updatedAt: now,
        churnScore: scoring.score.toFixed(2),
        churnScoreUpdatedAt: now,
        churnScoreFeatures: { features: scoring.features, action: scoring.action },
        segment: scoring.segment,
        ...(emailHash ? { emailHash } : {}),
      },
    })
    .returning();

  if (!customerRow) {
    throw new Error("Customer upsert failed");
  }

  const lineItems = payload.line_items.map((li) => ({
    skuId: li.sku ?? undefined,
    title: li.title,
    qty: li.quantity,
    price: li.price ?? "0",
  }));

  const [orderRow] = await db
    .insert(orders)
    .values({
      shopId: shop.id,
      shopifyOrderId: String(payload.id),
      customerId: customerRow.id,
      aov: payload.total_price,
      currency: payload.currency,
      discountApplied: Boolean(payload.discount_codes?.length),
      discountCode: payload.discount_codes?.[0]?.code,
      lineItems,
    })
    .onConflictDoUpdate({
      target: [orders.shopId, orders.shopifyOrderId],
      set: {
        aov: payload.total_price,
        lineItems,
        currency: payload.currency,
      },
    })
    .returning();

  if (!orderRow) {
    throw new Error("Order upsert failed");
  }

  await enqueueJob(
    db,
    "post-purchase",
    {
      shopId: shop.id,
      orderId: orderRow.id,
      shopifyOrderId: String(payload.id),
    },
    new Date(Date.now() + postPurchaseDelayMs()),
  );

  const predictions = await recomputeReorderForCustomer(db, customerRow.id);
  await scheduleReplenishmentReminders(
    db,
    { shopId: shop.id, customerId: customerRow.id },
    predictions,
  );

  return {
    orderRowId: orderRow.id,
    customerRowId: customerRow.id,
    score: scoring.score,
  };
}

async function computeBrandMedianAov(
  db: DrizzleDb,
  shopId: string,
): Promise<number> {
  const rows = await db
    .select({ aov: orders.aov })
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .limit(500);
  const nums = rows
    .map((r) => Number(r.aov))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1]! + nums[mid]!) / 2 : nums[mid]!;
}
