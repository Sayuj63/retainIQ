import { notFound } from "next/navigation";
import { getCustomerDetail } from "@/lib/dashboard-queries";
import {
  Badge,
  Card,
  PageHeader,
  Stat,
  Table,
  Td,
  Tr,
  fmtDate,
  fmtRelative,
  scoreTone,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type Feature = { feature: string; value: unknown; impact: number };

export default async function CustomerDetail({
  params,
}: {
  params: { id: string };
}) {
  const data = await getCustomerDetail(params.id);
  if (!data) notFound();

  const { customer, orders, journey, shop } = data;
  const score = customer.churnScore != null ? Number(customer.churnScore) : null;
  const rawTone = scoreTone(score);
  const statTone: "default" | "success" | "warning" | "danger" =
    rawTone === "neutral" ? "default" : rawTone;
  const featuresWrap = customer.churnScoreFeatures as
    | { features?: Feature[]; action?: string }
    | null
    | undefined;
  const features = featuresWrap?.features ?? [];
  const action = featuresWrap?.action ?? "—";
  const ltv = orders.reduce((s, o) => s + Number(o.aov ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`Customer ${customer.shopifyCustomerId}`}
        subtitle={shop?.shopifyDomain ?? undefined}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat
          label="Churn score"
          value={score != null ? score.toFixed(1) : "—"}
          tone={statTone}
          hint={`updated ${fmtRelative(customer.churnScoreUpdatedAt)}`}
        />
        <Stat label="Segment" value={customer.segment ?? "—"} />
        <Stat label="Orders" value={customer.orderCount ?? 0} />
        <Stat label="LTV" value={`$${ltv.toFixed(2)}`} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Card title="Top features driving score">
          {features.length === 0 ? (
            <p className="text-sm text-foreground/55">
              No score features yet. Trigger an order.paid webhook for this
              customer.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {features.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2"
                >
                  <span className="font-medium">{f.feature}</span>
                  <span className="text-xs text-foreground/65">
                    value: {String(f.value)}
                  </span>
                  <span
                    className={`font-mono text-xs ${f.impact >= 0 ? "text-danger" : "text-success"}`}
                  >
                    {f.impact >= 0 ? "+" : ""}
                    {f.impact}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-foreground/55">
            Action queued: <code className="text-brand">{action}</code>
          </p>
        </Card>

        <Card title="Journey">
          <Table
            head={["Step", "Channel", "Status", "Scheduled"]}
            isEmpty={journey.length === 0}
            empty="No flow executions for this customer yet."
          >
            {journey.map((j) => (
              <Tr key={j.id}>
                <Td>
                  <div className="font-medium">{j.stepId}</div>
                  <div className="text-xs text-foreground/55">
                    {j.templateName}
                  </div>
                </Td>
                <Td>
                  <Badge tone="brand">{j.channel}</Badge>
                </Td>
                <Td>
                  <Badge
                    tone={
                      j.status === "sent"
                        ? "success"
                        : j.status === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {j.status}
                  </Badge>
                </Td>
                <Td>
                  <span className="text-xs text-foreground/55">
                    {fmtRelative(j.scheduledAt)}
                  </span>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card title="Orders">
        <Table
          head={["Order ID", "AOV", "Currency", "Discount", "Items", "Placed"]}
          isEmpty={orders.length === 0}
        >
          {orders.map((o) => (
            <Tr key={o.id}>
              <Td>
                <code className="text-xs">{o.shopifyOrderId}</code>
              </Td>
              <Td>{o.aov ?? "—"}</Td>
              <Td>{o.currency ?? "—"}</Td>
              <Td>
                {o.discountApplied ? (
                  <Badge tone="warning">{o.discountCode ?? "yes"}</Badge>
                ) : (
                  <span className="text-xs text-foreground/55">—</span>
                )}
              </Td>
              <Td>
                <span className="text-xs">
                  {(o.lineItems ?? []).map((li) => li.title).join(", ")}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-foreground/55">
                  {fmtDate(o.createdAt)}
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
