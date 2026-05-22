import Link from "next/link";
import type { ReactNode } from "react";
import { LiveDot } from "@/components/ui";

const NAV: Array<{ href: string; label: string; section?: string }> = [
  { href: "/", label: "Overview", section: "Operate" },
  { href: "/customers", label: "Customers", section: "Operate" },
  { href: "/orders", label: "Orders", section: "Operate" },
  { href: "/flows", label: "Flows", section: "Engage" },
  { href: "/replenishment", label: "Replenishment", section: "Engage" },
  { href: "/reviews", label: "Reviews & NPS", section: "Engage" },
  { href: "/ab-tests", label: "A/B tests", section: "Engage" },
  { href: "/queue", label: "Queue", section: "Operations" },
  { href: "/shops", label: "Shops", section: "Operations" },
];

function groupBySection(items: typeof NAV) {
  const groups = new Map<string, typeof NAV>();
  for (const item of items) {
    const k = item.section ?? "—";
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return Array.from(groups.entries());
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const groups = groupBySection(NAV);
  return (
    <div className="grid min-h-screen grid-cols-[256px_1fr] bg-background-warm">
      <aside className="border-r border-border bg-surface px-5 py-7 shadow-soft">
        <Link href="/" className="mb-9 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-soft">
            R
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">
              RetainIQ Pro
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground-subtle">
              <LiveDot /> Merchant console
            </p>
          </div>
        </Link>

        <nav className="flex flex-col gap-6">
          {groups.map(([section, items]) => (
            <div key={section}>
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
                {section}
              </p>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-foreground-muted transition hover:bg-brand-soft hover:text-brand"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-10 rounded-xl border border-border bg-background-warm p-3 text-[11px] leading-relaxed text-foreground-muted">
          Phase-1 console. Stub providers log dispatches to stdout. Swap{" "}
          <code className="rounded bg-brand-soft px-1 py-0.5 font-mono text-[10px] text-brand">
            lib/providers.ts
          </code>{" "}
          to wire real channels.
        </div>
      </aside>
      <main className="px-10 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
