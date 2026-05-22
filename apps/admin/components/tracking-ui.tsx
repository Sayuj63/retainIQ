import type { ReactNode } from "react";

export const STAGES = [
  { key: "ordered", label: "Order placed" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export function inferStage(
  fulfillmentStatus: string | null,
  hasTracking: boolean,
  deliveredAt: Date | null,
): StageKey {
  if (deliveredAt) return "delivered";
  if (fulfillmentStatus === "out_for_delivery") return "out_for_delivery";
  if (fulfillmentStatus === "in_transit" || hasTracking) return "shipped";
  if (fulfillmentStatus === "packed" || fulfillmentStatus === "fulfilled") {
    return "packed";
  }
  return "ordered";
}

export function ProgressTimeline({ current }: { current: StageKey }) {
  const idx = STAGES.findIndex((s) => s.key === current);
  return (
    <ol className="relative grid grid-cols-5 gap-2">
      <div className="absolute left-0 right-0 top-3 h-1 rounded-full bg-border" />
      <div
        className="absolute left-0 top-3 h-1 rounded-full bg-teal-400 transition-all"
        style={{ width: `${(idx / (STAGES.length - 1)) * 100}%` }}
      />
      {STAGES.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s.key} className="relative flex flex-col items-center">
            <span
              className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-soft ${
                done
                  ? "border-teal-400 bg-teal-400 text-white"
                  : "border-border bg-surface text-foreground-subtle"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`mt-2 text-center text-[11px] font-medium ${
                done ? "text-foreground" : "text-foreground-subtle"
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function TrackingHero({
  title,
  subtitle,
  status,
  eta,
}: {
  title: string;
  subtitle: ReactNode;
  status: ReactNode;
  eta: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-8 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
            {status}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-purple-100 bg-brand-soft px-5 py-4 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
            Estimated delivery
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">{eta}</p>
        </div>
      </div>
    </section>
  );
}
