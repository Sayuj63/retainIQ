import { describe, expect, it } from "vitest";
import { predictNextReorder } from "./replenishment";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

describe("predictNextReorder", () => {
  it("falls back to category prior when only one observation exists", () => {
    const p = predictNextReorder({
      sku: "X",
      title: "X",
      timestamps: [daysAgo(10)],
    });
    expect(p).not.toBeNull();
    expect(p!.source).toBe("category_prior");
    expect(p!.observations).toBe(0);
    expect(p!.predictedAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("uses personal cadence with Bayesian shrinkage when multiple intervals exist", () => {
    const p = predictNextReorder({
      sku: "COFFEE",
      title: "Coffee",
      timestamps: [daysAgo(120), daysAgo(90), daysAgo(60), daysAgo(30)],
    });
    expect(p).not.toBeNull();
    expect(p!.source).toBe("personal");
    expect(p!.observations).toBe(3);
    expect(p!.meanIntervalDays).toBeGreaterThan(20);
    expect(p!.meanIntervalDays).toBeLessThan(40);
  });

  it("narrows the uncertainty band as observations grow", () => {
    const few = predictNextReorder({
      sku: "X",
      title: "X",
      timestamps: [daysAgo(60), daysAgo(30)],
    })!;
    const many = predictNextReorder({
      sku: "X",
      title: "X",
      timestamps: [
        daysAgo(180),
        daysAgo(150),
        daysAgo(120),
        daysAgo(90),
        daysAgo(60),
        daysAgo(30),
      ],
    })!;
    const fewWidth =
      few.uncertaintyUpperAt.getTime() - few.uncertaintyLowerAt.getTime();
    const manyWidth =
      many.uncertaintyUpperAt.getTime() - many.uncertaintyLowerAt.getTime();
    expect(manyWidth).toBeLessThan(fewWidth);
  });
});
