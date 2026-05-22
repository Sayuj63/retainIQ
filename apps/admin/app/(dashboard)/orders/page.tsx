import { getRecentOrders } from "@/lib/dashboard-queries";
import {
  Badge,
  PageHeader,
  Table,
  Td,
  Tr,
  fmtRelative,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const rows = await getRecentOrders(100);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Most recent ingested orders across all installed shops."
      />
      <Table
        head={["Order", "Shop", "AOV", "Items", "Discount", "Placed"]}
        isEmpty={rows.length === 0}
      >
        {rows.map((o) => (
          <Tr key={o.id}>
            <Td>
              <code className="text-xs">{o.shopifyOrderId}</code>
            </Td>
            <Td>
              <span className="text-xs text-foreground/65">
                {o.shopDomain ?? "—"}
              </span>
            </Td>
            <Td>
              <span className="font-medium">{o.aov ?? "—"}</span>{" "}
              <span className="text-xs text-foreground/55">{o.currency}</span>
            </Td>
            <Td>
              <span className="text-xs">
                {(o.lineItems ?? [])
                  .map((li) => `${li.title} × ${li.qty}`)
                  .join(", ")}
              </span>
            </Td>
            <Td>
              {o.discountApplied ? (
                <Badge tone="warning">yes</Badge>
              ) : (
                <span className="text-xs text-foreground/55">no</span>
              )}
            </Td>
            <Td>
              <span className="text-xs text-foreground/55">
                {fmtRelative(o.createdAt)}
              </span>
            </Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
