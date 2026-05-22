import { getAbTestResults } from "@/lib/dashboard-queries";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Two-proportion z-test on send-success rate (proxy for engagement). */
function significance(
  a: { sent: number; failed: number },
  b: { sent: number; failed: number },
): { pValue: number; winner: "A" | "B" | null } {
  const nA = a.sent + a.failed;
  const nB = b.sent + b.failed;
  if (nA < 30 || nB < 30) return { pValue: 1, winner: null };
  const pA = a.sent / nA;
  const pB = b.sent / nB;
  const p = (a.sent + b.sent) / (nA + nB);
  const se = Math.sqrt(p * (1 - p) * (1 / nA + 1 / nB));
  if (se === 0) return { pValue: 1, winner: null };
  const z = (pA - pB) / se;
  // Two-sided normal approx
  const pValue = 2 * (1 - cdfStdNormal(Math.abs(z)));
  if (pValue >= 0.05) return { pValue, winner: null };
  return { pValue, winner: pA > pB ? "A" : "B" };
}

function cdfStdNormal(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    1 -
    d *
      (0.319381530 * t -
        0.356563782 * t * t +
        1.781477937 * Math.pow(t, 3) -
        1.821255978 * Math.pow(t, 4) +
        1.330274429 * Math.pow(t, 5));
  return p;
}

export default async function AbTestsPage() {
  const groups = await getAbTestResults();

  return (
    <>
      <PageHeader
        title="A/B tests"
        subtitle="Send-success rate per variant. Significance computed at p < 0.05 (z-test, ≥30 per arm)."
      />

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground/65">
            No variant data yet. The default <code>post-purchase</code> flow
            includes a 2-variant test on the high-risk discount step (
            <code>A_value</code> vs <code>B_urgency</code>) — trigger enough
            high-score orders to see results.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const variants = Array.from(g.variants.entries());
            const [a, b] = variants.slice(0, 2);
            const sig =
              a && b ? significance(a[1], b[1]) : { pValue: 1, winner: null };
            return (
              <Card key={`${g.flowName}-${g.stepId}`}>
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {g.flowName ?? "—"} · <code>{g.stepId}</code>
                    </h3>
                    <p className="mt-1 text-xs text-foreground/55">
                      {variants.length} variant
                      {variants.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {a && b ? (
                    sig.winner ? (
                      <Badge tone="success">
                        Winner: {sig.winner} (p={sig.pValue.toFixed(3)})
                      </Badge>
                    ) : (
                      <Badge tone="neutral">
                        Not significant (p={sig.pValue.toFixed(3)})
                      </Badge>
                    )
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {variants.map(([id, v]) => {
                    const total = v.sent + v.failed + v.scheduled;
                    const rate =
                      v.sent + v.failed > 0
                        ? (v.sent / (v.sent + v.failed)) * 100
                        : 0;
                    return (
                      <div
                        key={id}
                        className="rounded-xl border border-border bg-surface-muted p-4"
                      >
                        <div className="flex items-center justify-between">
                          <code className="text-sm font-semibold">{id}</code>
                          <span className="text-xs text-foreground/65">
                            {total} dispatched
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full bg-brand"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-foreground/65">
                          {v.sent} sent · {v.failed} failed · {v.scheduled} pending —{" "}
                          {rate.toFixed(1)}% success
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
