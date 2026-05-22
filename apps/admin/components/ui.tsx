import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function Card({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
      {title ? (
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
          {title}
        </h2>
      ) : null}
      {children}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${toneClass}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?:
    | "neutral"
    | "brand"
    | "success"
    | "warning"
    | "danger"
    | "champion"
    | "loyal"
    | "at_risk"
    | "dormant"
    | "new";
}) {
  const map: Record<string, string> = {
    neutral: "bg-surface-muted text-foreground-muted border-border",
    brand: "bg-brand-soft text-brand border-purple-100",
    success: "bg-success-soft text-success border-success-border",
    warning: "bg-warning-soft text-warning border-warning/30",
    danger: "bg-danger-soft text-danger border-danger/30",
    champion: "bg-success-soft text-success border-success-border",
    loyal: "bg-purple-50 text-purple-600 border-purple-100",
    at_risk: "bg-warning-soft text-warning border-warning/30",
    dormant: "bg-danger-soft text-danger border-danger/30",
    new: "bg-brand-soft text-brand border-purple-100",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[tone] ?? map.neutral}`}
    >
      {children}
    </span>
  );
}

export function Table({
  head,
  children,
  empty = "Nothing here yet.",
  isEmpty,
}: {
  head: string[];
  children: ReactNode;
  empty?: string;
  isEmpty: boolean;
}) {
  if (isEmpty) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-foreground-muted">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-muted text-left text-[11px] uppercase tracking-[0.08em] text-foreground-subtle">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="transition hover:bg-surface-muted/60">{children}</tr>;
}

export function Td({ children }: { children: ReactNode }) {
  return (
    <td className="px-4 py-3 align-top text-foreground">{children}</td>
  );
}

export function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
    </span>
  );
}

export function scoreTone(
  score: number | null,
): "neutral" | "success" | "warning" | "danger" {
  if (score == null) return "neutral";
  if (score >= 85) return "danger";
  if (score >= 70) return "warning";
  if (score < 40) return "success";
  return "neutral";
}

export function fmtPct(n: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);
  if (sec < 60) return diff < 0 ? `${sec}s ago` : `in ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return diff < 0 ? `${min}m ago` : `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return diff < 0 ? `${hr}h ago` : `in ${hr}h`;
  const day = Math.floor(hr / 24);
  return diff < 0 ? `${day}d ago` : `in ${day}d`;
}
