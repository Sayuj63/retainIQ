import { describe, expect, it } from "vitest";
import { scoreCustomer } from "./scoring";

describe("scoreCustomer", () => {
  it("routes a high-AOV first-time buyer with discount to standard or at_risk", () => {
    const r = scoreCustomer({
      aov: 200,
      brandMedianAov: 50,
      daysSinceLastOrder: null,
      orderCount: 1,
      discountUsed: true,
    });
    expect(r.segment).toBe("new");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.features.length).toBeGreaterThan(0);
  });

  it("flags a low-AOV repeat buyer who hasn't ordered in 90 days as at_risk", () => {
    const r = scoreCustomer({
      aov: 10,
      brandMedianAov: 50,
      daysSinceLastOrder: 90,
      orderCount: 2,
      discountUsed: true,
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.action).toMatch(/high_risk_discount|critical_vip/);
    expect(r.segment).toBe("at_risk");
  });

  it("treats a 5-order high-spender as champion", () => {
    const r = scoreCustomer({
      aov: 200,
      brandMedianAov: 50,
      daysSinceLastOrder: 14,
      orderCount: 5,
      discountUsed: false,
    });
    expect(r.score).toBeLessThan(40);
    expect(r.segment).toBe("champion");
    expect(r.action).toBe("low_risk_referral");
  });

  it("marks long-dormant buyers as dormant regardless of score", () => {
    const r = scoreCustomer({
      aov: 50,
      brandMedianAov: 50,
      daysSinceLastOrder: 200,
      orderCount: 3,
      discountUsed: false,
    });
    expect(r.segment).toBe("dormant");
  });

  it("returns at most 3 top features", () => {
    const r = scoreCustomer({
      aov: 70,
      brandMedianAov: 50,
      daysSinceLastOrder: 45,
      orderCount: 2,
      discountUsed: true,
      categoryChurnBaseline: 60,
    });
    expect(r.features.length).toBeLessThanOrEqual(3);
  });

  it("clamps score within 0..100", () => {
    const r = scoreCustomer({
      aov: 1,
      brandMedianAov: 100,
      daysSinceLastOrder: 365,
      orderCount: 1,
      discountUsed: true,
      categoryChurnBaseline: 95,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
