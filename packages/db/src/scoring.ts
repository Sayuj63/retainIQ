/**
 * Phase 1 rule-based churn scoring (PRD §5.1).
 *
 * Returns a score 0–100 where higher = more likely to churn, the top
 * contributing features (a stand-in for SHAP values until the LightGBM
 * model lands in Phase 2), and the routed segment per PRD §5.1.3.
 */

export type ScoringInputs = {
  aov: number;
  brandMedianAov: number;
  daysSinceLastOrder: number | null;
  orderCount: number;
  discountUsed: boolean;
  categoryChurnBaseline?: number;
};

export type ScoringFeature = {
  feature: string;
  value: string | number | boolean;
  impact: number;
};

export type Segment = "champion" | "loyal" | "at_risk" | "dormant" | "new";

export type ScoringResult = {
  score: number;
  features: ScoringFeature[];
  segment: Segment;
  action: "low_risk_referral" | "standard" | "high_risk_discount" | "critical_vip";
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function scoreCustomer(inputs: ScoringInputs): ScoringResult {
  const features: ScoringFeature[] = [];
  let score = 30;

  const aovDelta =
    inputs.brandMedianAov > 0
      ? (inputs.aov - inputs.brandMedianAov) / inputs.brandMedianAov
      : 0;
  const aovImpact = clamp(-aovDelta * 20, -15, 25);
  score += aovImpact;
  features.push({
    feature: "aov_vs_median",
    value: Number(aovDelta.toFixed(3)),
    impact: Number(aovImpact.toFixed(2)),
  });

  if (inputs.discountUsed) {
    score += 12;
    features.push({ feature: "discount_used", value: true, impact: 12 });
  }

  if (inputs.daysSinceLastOrder != null) {
    const dsl = inputs.daysSinceLastOrder;
    const dslImpact = clamp((dsl - 30) * 0.4, -10, 25);
    score += dslImpact;
    features.push({
      feature: "days_since_last_order",
      value: dsl,
      impact: Number(dslImpact.toFixed(2)),
    });
  } else {
    score += 8;
    features.push({ feature: "first_order", value: true, impact: 8 });
  }

  if (inputs.orderCount >= 4) {
    score -= 18;
    features.push({
      feature: "repeat_buyer",
      value: inputs.orderCount,
      impact: -18,
    });
  } else if (inputs.orderCount >= 2) {
    score -= 8;
    features.push({
      feature: "returning_buyer",
      value: inputs.orderCount,
      impact: -8,
    });
  }

  if (inputs.categoryChurnBaseline != null) {
    const cIm = clamp((inputs.categoryChurnBaseline - 50) * 0.3, -8, 12);
    score += cIm;
    features.push({
      feature: "category_churn_baseline",
      value: inputs.categoryChurnBaseline,
      impact: Number(cIm.toFixed(2)),
    });
  }

  const final = Math.round(clamp(score, 0, 100) * 100) / 100;

  features.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const top = features.slice(0, 3);

  const segment = pickSegment(final, inputs.orderCount, inputs.daysSinceLastOrder);
  const action = pickAction(final);

  return { score: final, features: top, segment, action };
}

function pickSegment(
  score: number,
  orderCount: number,
  daysSinceLastOrder: number | null,
): Segment {
  if (orderCount === 1 && daysSinceLastOrder == null) return "new";
  if (daysSinceLastOrder != null && daysSinceLastOrder > 120) return "dormant";
  if (score >= 70) return "at_risk";
  if (orderCount >= 4 && score < 40) return "champion";
  return "loyal";
}

function pickAction(score: number): ScoringResult["action"] {
  if (score >= 85) return "critical_vip";
  if (score >= 70) return "high_risk_discount";
  if (score < 40) return "low_risk_referral";
  return "standard";
}
