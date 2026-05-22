import { and, eq } from "drizzle-orm";
import type { DrizzleDb } from "./create-db";
import { flows } from "./schema/flows";

export type FlowStepVariant = {
  id: string;
  body: string;
  weight?: number;
};

export type FlowStepConfig = {
  id: string;
  channel: "whatsapp" | "sms" | "email";
  fallbackChannel?: "whatsapp" | "sms" | "email";
  delayMs: number;
  template: string;
  body: string;
  variants?: FlowStepVariant[];
  abTestId?: string;
  condition?: { minScore?: number; maxScore?: number };
};

export type FlowConfig = {
  description?: string;
  steps: FlowStepConfig[];
};

const DEFAULT_FLOWS: Array<{
  name: string;
  trigger: string;
  config: FlowConfig;
}> = [
  {
    name: "Post-purchase nurture",
    trigger: "order_paid",
    config: {
      description: "Branches by churn score per PRD §5.2.1.",
      steps: [
        {
          id: "confirm",
          channel: "whatsapp",
          fallbackChannel: "email",
          delayMs: 0,
          template: "order_confirmation",
          body:
            "Hi {{first_name}}, your {{product_name}} is on its way! Track here: {{tracking_url}}",
        },
        {
          id: "high_risk_offer",
          channel: "whatsapp",
          fallbackChannel: "sms",
          delayMs: 2 * 60 * 60 * 1000,
          template: "high_risk_discount",
          body:
            "{{first_name}}, enjoy {{discount_pct}}% off your next {{product_name}}: {{discount_code}}",
          abTestId: "high_risk_copy_v1",
          variants: [
            {
              id: "A_value",
              body:
                "{{first_name}}, enjoy {{discount_pct}}% off your next {{product_name}}: {{discount_code}}",
              weight: 1,
            },
            {
              id: "B_urgency",
              body:
                "{{first_name}} — limited 48h: {{discount_pct}}% off {{product_name}} with {{discount_code}}",
              weight: 1,
            },
          ],
          condition: { minScore: 70 },
        },
        {
          id: "low_risk_referral",
          channel: "whatsapp",
          fallbackChannel: "email",
          delayMs: 2 * 60 * 60 * 1000,
          template: "low_risk_referral",
          body:
            "Loved your {{product_name}}? Share with a friend and you both get rewards: {{referral_link}}",
          condition: { maxScore: 39 },
        },
        {
          id: "usage_tip",
          channel: "whatsapp",
          fallbackChannel: "sms",
          delayMs: 24 * 60 * 60 * 1000,
          template: "usage_tip",
          body:
            "Tip for your {{product_name}}: {{usage_tip}}. Join our community: {{community_link}}",
        },
        {
          id: "review_request",
          channel: "whatsapp",
          fallbackChannel: "email",
          delayMs: 72 * 60 * 60 * 1000,
          template: "review_request",
          body:
            "Hi {{first_name}}, how's your {{product_name}}? Rate it here: {{review_link}}",
        },
        {
          id: "nps_survey",
          channel: "whatsapp",
          fallbackChannel: "email",
          delayMs: 14 * 24 * 60 * 60 * 1000,
          template: "nps_survey",
          body:
            "{{first_name}}, on a 0–10 scale, how likely are you to recommend us? {{nps_link}}",
        },
      ],
    },
  },
];

export async function seedDefaultFlowsForShop(
  db: DrizzleDb,
  shopId: string,
): Promise<void> {
  for (const f of DEFAULT_FLOWS) {
    const existing = await db
      .select({ id: flows.id })
      .from(flows)
      .where(and(eq(flows.shopId, shopId), eq(flows.name, f.name)))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(flows).values({
      shopId,
      name: f.name,
      trigger: f.trigger,
      isActive: true,
      config: f.config as Record<string, unknown>,
    });
  }
}

export function getStepDelayScale(): number {
  const v = process.env.RETAINIQ_FLOW_DELAY_SCALE;
  if (v == null || v === "") return 1;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}
