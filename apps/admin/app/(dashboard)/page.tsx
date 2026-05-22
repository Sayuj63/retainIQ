import Link from "next/link";
import {
  getCounts,
  getRecentExecutions,
  getSegmentBreakdown,
} from "@/lib/dashboard-queries";
import { getRecentDeliveredOrders } from "@/lib/tracking-queries";
import {
  Badge,
  Card,
  PageHeader,
  Stat,
  Table,
  Td,
  Tr,
  fmtPct,
  fmtRelative,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [counts, segments, execs, trackable] = await Promise.all([
    getCounts(),
    getSegmentBreakdown(),
    getRecentExecutions(15),
    getRecentDeliveredOrders(6),
  ]);

  const totalCustomers = segments.reduce((s, x) => s + x.count, 0);
  const sortedSegments = [...segments].sort((a, b) => b.count - a.count);

  const totalMsgs =
    counts.sentMessages + counts.failedMessages + counts.scheduledMessages;
  const successRate =
    totalMsgs > 0
      ? `${Math.round((counts.sentMessages / totalMsgs) * 100)}%`
      : "—";

  return (
    <>
      <PageHeader
        title="Retention overview"
        subtitle={`Phase 1 console — ${counts.shops} installed shop${counts.shops === 1 ? "" : "s"}.`}
        action={
          <Link
            href="/api/dev/seed"
            className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-brand-hover"
          >
            Generate demo data
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Customers" value={counts.customers} />
        <Stat label="Orders" value={counts.orders} />
        <Stat
          label="Messages sent"
          value={counts.sentMessages}
          hint={`${successRate} delivery success`}
          tone="success"
        />
        <Stat
          label="Pending jobs"
          value={counts.pendingJobs}
          hint={`${counts.scheduledMessages} scheduled, ${counts.failedMessages} failed`}
          tone={counts.failedMessages > 0 ? "warning" : "default"}
        />
      </div>

      {trackable.length > 0 ? (
        <Card title="Branded tracking pages (customer view)" footer={
          <p className="text-xs text-foreground-muted">
            These are public, no-auth pages your buyers receive in WhatsApp /
            email. Delivered orders show the review CTA.
          </p>
        }>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trackable.map((o) => {
              const isDelivered = Boolean(o.deliveredAt);
              const first = (o.lineItems ?? [])[0];
              return (
                <li
                  key={o.id}
                  className="rounded-xl border border-border bg-background-warm p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
                    #{o.shopifyOrderId} · {o.carrier ?? "awaiting carrier"}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {first?.title ?? "Order"}
                  </p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {isDelivered ? "Delivered" : o.fulfillmentStatus ?? "Placed"}
                  </p>
                  <Link
                    href={`/t/${o.shopDomain}/orders/${o.id}`}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-brand-muted bg-surface px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft"
                  >
                    Open tracking page →
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Segment breakdown">
          {sortedSegments.length === 0 ? (
            <p className="text-sm text-foreground/55">
              No customers yet. Trigger a webhook or generate demo data.
            </p>
          ) : (
            <ul className="space-y-3">
              {sortedSegments.map((seg) => (
                <li key={seg.segment} className="flex items-center gap-3">
                  <Badge
                    tone={
                      (seg.segment as
                        | "champion"
                        | "loyal"
                        | "at_risk"
                        | "dormant"
                        | "new") || "neutral"
                    }
                  >
                    {seg.segment}
                  </Badge>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full bg-brand"
                      style={{
                        width: `${totalCustomers > 0 ? (seg.count / totalCustomers) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm tabular-nums">
                    {seg.count}
                  </span>
                  <span className="w-12 text-right text-xs text-foreground/55">
                    {fmtPct(seg.count, totalCustomers)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent message activity">
          <Table
            head={["Step", "Channel", "Status", "Scheduled"]}
            isEmpty={execs.length === 0}
            empty="No flow executions yet."
          >
            {execs.map((e) => (
              <Tr key={e.id}>
                <Td>
                  <div className="font-medium">{e.stepId}</div>
                  <div className="text-xs text-foreground/55">
                    {e.templateName ?? "—"}
                  </div>
                </Td>
                <Td>
                  <Badge tone="brand">{e.channel}</Badge>
                </Td>
                <Td>
                  <Badge
                    tone={
                      e.status === "sent"
                        ? "success"
                        : e.status === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {e.status}
                  </Badge>
                </Td>
                <Td>
                  <span className="text-xs text-foreground/55">
                    {fmtRelative(e.scheduledAt)}
                  </span>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
