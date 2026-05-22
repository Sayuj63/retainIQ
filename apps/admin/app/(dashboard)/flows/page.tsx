import { revalidatePath } from "next/cache";
import { getFlows, setFlowActive } from "@/lib/dashboard-queries";
import {
  Badge,
  Card,
  PageHeader,
  Table,
  Td,
  Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";

async function toggleFlow(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id) return;
  await setFlowActive(id, next);
  revalidatePath("/flows");
}

type StepCfg = {
  id: string;
  channel: string;
  delayMs: number;
  template: string;
  condition?: { minScore?: number; maxScore?: number };
};

function describeDelay(ms: number): string {
  if (ms === 0) return "T+0";
  const hr = ms / 3_600_000;
  if (hr >= 24) return `T+${Math.round(hr / 24)}d`;
  if (hr >= 1) return `T+${Math.round(hr)}h`;
  return `T+${Math.round(ms / 60_000)}m`;
}

export default async function FlowsPage() {
  const rows = await getFlows();

  return (
    <>
      <PageHeader
        title="Flows"
        subtitle="Journey configurations. Per-shop, seeded on OAuth install."
      />

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-foreground/65">
            No flows yet. Complete a Shopify OAuth install at{" "}
            <code className="rounded bg-brand-soft px-1.5 py-0.5 text-brand">
              /api/auth?shop=…
            </code>{" "}
            to seed defaults.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {rows.map((f) => {
            const cfg = f.config as {
              description?: string;
              steps?: StepCfg[];
            };
            const steps = cfg.steps ?? [];
            return (
              <Card key={f.id}>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{f.name}</h3>
                    <p className="mt-1 text-xs text-foreground/55">
                      {f.shopDomain ?? "—"} · trigger:{" "}
                      <code>{f.trigger}</code>
                    </p>
                    {cfg.description ? (
                      <p className="mt-2 text-sm text-foreground/65">
                        {cfg.description}
                      </p>
                    ) : null}
                  </div>
                  <form action={toggleFlow}>
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      type="hidden"
                      name="next"
                      value={f.isActive ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className={`rounded-md px-3 py-2 text-xs font-medium shadow-sm transition ${
                        f.isActive
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "bg-surface-muted text-foreground/65 hover:bg-border"
                      }`}
                    >
                      {f.isActive ? "Active — click to pause" : "Paused — click to activate"}
                    </button>
                  </form>
                </div>
                <Table
                  head={["Step", "Channel", "Timing", "Template", "Condition"]}
                  isEmpty={steps.length === 0}
                >
                  {steps.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <code className="text-xs">{s.id}</code>
                      </Td>
                      <Td>
                        <Badge tone="brand">{s.channel}</Badge>
                      </Td>
                      <Td>{describeDelay(s.delayMs)}</Td>
                      <Td>
                        <code className="text-xs">{s.template}</code>
                      </Td>
                      <Td>
                        {s.condition ? (
                          <span className="text-xs">
                            {s.condition.minScore != null
                              ? `score ≥ ${s.condition.minScore}`
                              : ""}
                            {s.condition.maxScore != null
                              ? ` score ≤ ${s.condition.maxScore}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-foreground/55">always</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
