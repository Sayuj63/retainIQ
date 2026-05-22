import Link from "next/link";
import { getRecentCustomers } from "@/lib/dashboard-queries";
import {
  Badge,
  PageHeader,
  Table,
  Td,
  Tr,
  fmtRelative,
  scoreTone,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const rows = await getRecentCustomers(100);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Sorted by churn-risk score (highest first)."
      />
      <Table
        head={["Customer", "Score", "Segment", "Orders", "Channels", "Last order"]}
        isEmpty={rows.length === 0}
        empty="No customers yet. Send a Shopify order.paid webhook to /api/webhooks."
      >
        {rows.map((c) => {
          const score = c.churnScore != null ? Number(c.churnScore) : null;
          const tone = scoreTone(score);
          return (
            <Tr key={c.id}>
              <Td>
                <Link
                  href={`/customers/${c.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {c.shopifyCustomerId}
                </Link>
                <div className="text-xs text-foreground/55">
                  {c.shopDomain ?? "—"}
                </div>
              </Td>
              <Td>
                <Badge
                  tone={
                    tone === "danger"
                      ? "danger"
                      : tone === "warning"
                        ? "warning"
                        : tone === "success"
                          ? "success"
                          : "neutral"
                  }
                >
                  {score != null ? score.toFixed(1) : "—"}
                </Badge>
              </Td>
              <Td>
                <Badge
                  tone={
                    (c.segment as
                      | "champion"
                      | "loyal"
                      | "at_risk"
                      | "dormant"
                      | "new") || "neutral"
                  }
                >
                  {c.segment ?? "—"}
                </Badge>
              </Td>
              <Td>{c.orderCount}</Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {c.optInWhatsapp ? <Badge tone="brand">WA</Badge> : null}
                  {c.optInSms ? <Badge tone="brand">SMS</Badge> : null}
                  {c.optInEmail ? <Badge tone="brand">Email</Badge> : null}
                  {!c.optInWhatsapp && !c.optInSms && !c.optInEmail ? (
                    <span className="text-xs text-foreground/55">none</span>
                  ) : null}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-foreground/65">
                  {fmtRelative(c.lastOrderAt)}
                </span>
              </Td>
            </Tr>
          );
        })}
      </Table>
    </>
  );
}
