import { and, eq } from "drizzle-orm";
import type { DrizzleDb } from "./create-db";
import { customers } from "./schema/customers";
import { flowExecutions } from "./schema/flow-executions";
import { flows } from "./schema/flows";
import { orders } from "./schema/orders";
import { shops } from "./schema/shops";
import { enqueueJob } from "./job-queue";
import crypto from "node:crypto";
import {
  type FlowConfig,
  type FlowStepConfig,
  type FlowStepVariant,
  getStepDelayScale,
} from "./seed-flows";

export type DispatchPayload = {
  shopId: string;
  flowId: string;
  executionId: string;
  customerId: string;
  orderId: string;
  stepId: string;
  variantId?: string;
  channel: "whatsapp" | "sms" | "email";
  fallbackChannel?: "whatsapp" | "sms" | "email";
  template: string;
  bodyTemplate: string;
};

export function pickVariant(
  variants: FlowStepVariant[] | undefined,
  customerId: string,
  abTestId: string | undefined,
): FlowStepVariant | null {
  if (!variants || variants.length === 0) return null;
  const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
  if (totalWeight <= 0) return variants[0]!;
  const hash = crypto
    .createHash("sha256")
    .update(`${abTestId ?? ""}:${customerId}`)
    .digest();
  const pick = ((hash.readUInt32BE(0) % 10_000) / 10_000) * totalWeight;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight ?? 1;
    if (pick < acc) return v;
  }
  return variants[variants.length - 1]!;
}

function stepAllowed(
  step: FlowStepConfig,
  score: number | null,
): boolean {
  const c = step.condition;
  if (!c) return true;
  const s = score ?? 50;
  if (c.minScore != null && s < c.minScore) return false;
  if (c.maxScore != null && s > c.maxScore) return false;
  return true;
}

function pickChannel(
  step: FlowStepConfig,
  optIn: { whatsapp: boolean; sms: boolean; email: boolean },
): "whatsapp" | "sms" | "email" | null {
  const order: Array<"whatsapp" | "sms" | "email"> = [
    step.channel,
    ...(step.fallbackChannel ? [step.fallbackChannel] : []),
    "email",
  ];
  for (const ch of order) {
    if (ch === "whatsapp" && optIn.whatsapp) return "whatsapp";
    if (ch === "sms" && optIn.sms) return "sms";
    if (ch === "email" && optIn.email) return "email";
  }
  return null;
}

/**
 * Plan a flow run: pick eligible steps, create pending flow_executions
 * rows, and enqueue a `dispatch-step` job for each scheduled at the
 * appropriate offset.
 */
export async function planPostPurchaseFlow(
  db: DrizzleDb,
  args: { shopId: string; orderId: string },
): Promise<{ scheduled: number }> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, args.orderId))
    .limit(1);
  if (!order || !order.customerId) return { scheduled: 0 };

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, order.customerId))
    .limit(1);
  if (!customer) return { scheduled: 0 };

  const activeFlows = await db
    .select()
    .from(flows)
    .where(
      and(
        eq(flows.shopId, args.shopId),
        eq(flows.trigger, "order_paid"),
        eq(flows.isActive, true),
      ),
    );

  const score = customer.churnScore != null ? Number(customer.churnScore) : null;
  const optIn = {
    whatsapp: Boolean(customer.optInWhatsapp),
    sms: Boolean(customer.optInSms),
    email: Boolean(customer.optInEmail),
  };
  const scale = getStepDelayScale();
  const now = Date.now();
  let scheduled = 0;

  for (const flow of activeFlows) {
    const cfg = flow.config as unknown as FlowConfig;
    if (!cfg?.steps) continue;
    for (const step of cfg.steps) {
      if (!stepAllowed(step, score)) continue;
      const channel = pickChannel(step, optIn);
      if (!channel) continue;

      const scheduledAt = new Date(now + step.delayMs * scale);
      const variant = pickVariant(step.variants, customer.id, step.abTestId);
      const body = variant?.body ?? step.body;

      const [exec] = await db
        .insert(flowExecutions)
        .values({
          shopId: args.shopId,
          customerId: customer.id,
          orderId: order.id,
          flowId: flow.id,
          stepId: step.id,
          variantId: variant?.id ?? null,
          channel,
          status: "scheduled",
          templateName: step.template,
          scheduledAt,
        })
        .returning();
      if (!exec) continue;

      const payload: DispatchPayload = {
        shopId: args.shopId,
        flowId: flow.id,
        executionId: exec.id,
        customerId: customer.id,
        orderId: order.id,
        stepId: step.id,
        variantId: variant?.id,
        channel,
        fallbackChannel: step.fallbackChannel,
        template: step.template,
        bodyTemplate: body,
      };
      await enqueueJob(
        db,
        "dispatch-step",
        payload as unknown as Record<string, unknown>,
        scheduledAt,
      );
      scheduled++;
    }
  }

  return { scheduled };
}

export type ChannelProvider = (input: {
  to: string;
  body: string;
  template: string;
  shopDomain: string;
}) => Promise<{ providerMessageId: string }>;

export type ChannelProviders = {
  whatsapp: ChannelProvider;
  sms: ChannelProvider;
  email: ChannelProvider;
};

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_m, k: string) =>
    vars[k] != null ? vars[k] : "",
  );
}

export async function dispatchStep(
  db: DrizzleDb,
  providers: ChannelProviders,
  raw: Record<string, unknown>,
): Promise<void> {
  const p = raw as unknown as DispatchPayload;

  const [exec] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, p.executionId))
    .limit(1);
  if (!exec) return;
  if (exec.status === "sent" || exec.status === "delivered") return;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, p.orderId))
    .limit(1);
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, p.customerId))
    .limit(1);
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.id, p.shopId))
    .limit(1);

  if (!order || !customer || !shop) {
    await db
      .update(flowExecutions)
      .set({
        status: "failed",
        errorCode: "missing_entity",
        errorMessage: "Order, customer or shop not found",
      })
      .where(eq(flowExecutions.id, p.executionId));
    return;
  }

  const firstName = (customer.emailHash?.slice(0, 6) ?? "there").replace(
    /[^a-z0-9]/gi,
    "",
  );
  const firstItem = order.lineItems?.[0];
  const vars: Record<string, string> = {
    first_name: firstName || "there",
    product_name: firstItem?.title ?? "your order",
    discount_pct: "15",
    discount_code: `RIQ${order.shopifyOrderId.slice(-4)}`,
    referral_link: `https://${shop.shopifyDomain}/pages/refer?c=${customer.id}`,
    tracking_url: `https://retainiq.app/t/${shop.shopifyDomain}/orders/${order.id}`,
    review_link: `https://retainiq.app/t/${shop.shopifyDomain}/review/${order.id}`,
    nps_link: `https://retainiq.app/t/${shop.shopifyDomain}/nps/${customer.id}`,
    usage_tip: "Store in a cool, dry place for best results.",
    community_link: `https://${shop.shopifyDomain}/community`,
  };
  const rendered = renderTemplate(p.bodyTemplate, vars);

  if (/\{\{\s*\w+\s*\}\}/.test(rendered)) {
    await db
      .update(flowExecutions)
      .set({
        status: "failed",
        errorCode: "template_unfilled",
        errorMessage: "Rendered template contains unfilled placeholders",
        renderedContent: rendered,
      })
      .where(eq(flowExecutions.id, p.executionId));
    return;
  }

  const provider = providers[p.channel];
  try {
    const result = await provider({
      to: customer.id,
      body: rendered,
      template: p.template,
      shopDomain: shop.shopifyDomain,
    });

    const now = new Date();
    await db
      .update(flowExecutions)
      .set({
        status: "sent",
        providerMessageId: result.providerMessageId,
        renderedContent: rendered,
        sentAt: now,
        deliveredAt: now,
      })
      .where(eq(flowExecutions.id, p.executionId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(flowExecutions)
      .set({
        status: "failed",
        errorCode: "provider_error",
        errorMessage: message,
        renderedContent: rendered,
      })
      .where(eq(flowExecutions.id, p.executionId));
  }
}
