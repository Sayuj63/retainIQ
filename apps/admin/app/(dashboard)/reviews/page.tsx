import { getNpsStats, getReviews, getReviewStats } from "@/lib/dashboard-queries";
import {
  Badge,
  Card,
  PageHeader,
  Stat,
  Table,
  Td,
  Tr,
  fmtRelative,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default async function ReviewsPage() {
  const [list, stats, nps] = await Promise.all([
    getReviews(50),
    getReviewStats(),
    getNpsStats(),
  ]);
  const max = Math.max(1, ...Object.values(stats.distribution));

  return (
    <>
      <PageHeader
        title="Reviews & NPS"
        subtitle="Routing per PRD §5.4.2 — 5★ auto-publishes, 1–2★ opens a recovery alert."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Avg rating"
          value={stats.avg > 0 ? stats.avg.toFixed(2) : "—"}
          hint={`${stats.total} review${stats.total === 1 ? "" : "s"}`}
        />
        <Stat
          label="NPS"
          value={nps.score != null ? nps.score : "—"}
          tone={
            nps.score == null
              ? "default"
              : nps.score >= 50
                ? "success"
                : nps.score >= 0
                  ? "warning"
                  : "danger"
          }
          hint={`${nps.total} response${nps.total === 1 ? "" : "s"}`}
        />
        <Stat label="Promoters" value={nps.promoters} tone="success" />
        <Stat
          label="Detractors"
          value={nps.detractors}
          tone={nps.detractors > 0 ? "danger" : "default"}
        />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="Star distribution">
          <ul className="space-y-2">
            {[5, 4, 3, 2, 1].map((r) => {
              const c = stats.distribution[r] ?? 0;
              return (
                <li key={r} className="flex items-center gap-3 text-sm">
                  <span className="w-14 font-mono">{stars(r)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${(c / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">{c}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="NPS breakdown">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <Badge tone="success">Promoters (9–10)</Badge>
              <span className="tabular-nums">{nps.promoters}</span>
            </li>
            <li className="flex items-center justify-between">
              <Badge tone="brand">Passives (7–8)</Badge>
              <span className="tabular-nums">{nps.passives}</span>
            </li>
            <li className="flex items-center justify-between">
              <Badge tone="danger">Detractors (0–6)</Badge>
              <span className="tabular-nums">{nps.detractors}</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-foreground/55">
            Detractors trigger a follow-up support job; promoters get a
            referral-program invite.
          </p>
        </Card>
      </div>

      <Card title="Recent reviews">
        <Table
          head={["Rating", "Sentiment", "Body", "Routing", "When"]}
          isEmpty={list.length === 0}
          empty="No reviews yet. POST to /api/reviews with {customerId, rating, bodyText}."
        >
          {list.map((r) => (
            <Tr key={r.id}>
              <Td>
                <span className="font-mono">{stars(r.rating)}</span>
              </Td>
              <Td>
                <Badge
                  tone={
                    r.sentiment === "positive"
                      ? "success"
                      : r.sentiment === "negative"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {r.sentiment ?? "—"}
                </Badge>
              </Td>
              <Td>
                <span className="text-xs">{r.bodyText ?? "—"}</span>
              </Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {r.published ? (
                    (r.publishedTo ?? []).map((p) => (
                      <Badge key={p} tone="success">
                        {p}
                      </Badge>
                    ))
                  ) : r.routedTo ? (
                    <Badge tone="warning">{r.routedTo}</Badge>
                  ) : null}
                  {r.supportTicketId ? (
                    <Badge tone="neutral">{r.supportTicketId}</Badge>
                  ) : null}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-foreground/55">
                  {fmtRelative(r.createdAt)}
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
