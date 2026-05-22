import {
  getReplenishmentForecast,
  getReplenishmentJobsPending,
} from "@/lib/dashboard-queries";
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

function bucketByWindow(
  forecast: Awaited<ReturnType<typeof getReplenishmentForecast>>,
) {
  const now = Date.now();
  const buckets = { d7: 0, d14: 0, d30: 0, d90: 0 };
  for (const row of forecast) {
    const d = (row.predictedAt.getTime() - now) / 86_400_000;
    if (d <= 7) buckets.d7++;
    else if (d <= 14) buckets.d14++;
    else if (d <= 30) buckets.d30++;
    else if (d <= 90) buckets.d90++;
  }
  return buckets;
}

export default async function ReplenishmentPage() {
  const [forecast, pending] = await Promise.all([
    getReplenishmentForecast(90),
    getReplenishmentJobsPending(),
  ]);
  const buckets = bucketByWindow(forecast);

  return (
    <>
      <PageHeader
        title="Replenishment forecast"
        subtitle="Predicted reorder dates per customer × SKU. Reminders fire 3 days before predicted depletion."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Due within 7 days" value={buckets.d7} tone="warning" />
        <Stat label="Due within 14 days" value={buckets.d14} />
        <Stat label="Due within 30 days" value={buckets.d30} />
        <Stat label="Reminders queued" value={pending.length} tone="success" />
      </div>

      <Card title="Upcoming reorders (next 90 days)">
        <Table
          head={["Customer", "SKU", "Predicted", "When"]}
          isEmpty={forecast.length === 0}
          empty="No predictions yet — needs at least 2 orders per customer×SKU."
        >
          {forecast.map((r) => (
            <Tr key={`${r.customerId}-${r.sku}`}>
              <Td>
                <code className="text-xs">{r.shopifyCustomerId}</code>
              </Td>
              <Td>
                <Badge tone="brand">{r.sku}</Badge>
              </Td>
              <Td>
                <span className="text-sm">
                  {r.predictedAt.toLocaleDateString()}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-foreground/65">
                  {fmtRelative(r.predictedAt)}
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
