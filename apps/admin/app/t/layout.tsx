import Link from "next/link";
import type { ReactNode } from "react";

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background-warm">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
              R
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Tracking by RetainIQ
            </span>
          </Link>
          <a
            href="mailto:help@example.com"
            className="text-xs font-medium text-foreground-muted hover:text-brand"
          >
            Need help?
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 text-[11px] text-foreground-subtle">
          <span>© 2026 RetainIQ Pro — Branded tracking</span>
          <span>Powered by RetainIQ</span>
        </div>
      </footer>
    </div>
  );
}
