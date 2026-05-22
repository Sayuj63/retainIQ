import { getShops } from "@/lib/dashboard-queries";
import {
  Badge,
  PageHeader,
  Table,
  Td,
  Tr,
  fmtDate,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const rows = await getShops();

  return (
    <>
      <PageHeader
        title="Installed shops"
        subtitle="Shopify stores that have completed OAuth (or been seeded for demo)."
      />
      <Table
        head={["Domain", "Plan", "Status", "Trial ends", "Installed"]}
        isEmpty={rows.length === 0}
        empty="No shops yet. Run /api/auth?shop=your-store.myshopify.com to install."
      >
        {rows.map((s) => (
          <Tr key={s.id}>
            <Td>
              <div className="font-medium">{s.shopifyDomain}</div>
              <div className="text-xs text-foreground/55">{s.id}</div>
            </Td>
            <Td>
              <Badge tone="brand">{s.planTier}</Badge>
            </Td>
            <Td>
              <Badge tone={s.isActive ? "success" : "neutral"}>
                {s.isActive ? "active" : "uninstalled"}
              </Badge>
            </Td>
            <Td>
              <span className="text-xs text-foreground/55">
                {fmtDate(s.trialEndsAt)}
              </span>
            </Td>
            <Td>
              <span className="text-xs text-foreground/55">
                {fmtDate(s.createdAt)}
              </span>
            </Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
