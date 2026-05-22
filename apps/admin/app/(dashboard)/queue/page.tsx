import { getQueue } from "@/lib/dashboard-queries";
import {
  Badge,
  PageHeader,
  Table,
  Td,
  Tr,
  fmtRelative,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const rows = await getQueue(150);

  return (
    <>
      <PageHeader
        title="Job queue"
        subtitle="Postgres-backed delayed job table — polled every 2s in dev."
      />
      <Table
        head={["Job", "Run at", "Started", "Completed", "Status"]}
        isEmpty={rows.length === 0}
      >
        {rows.map((j) => {
          const status = j.error
            ? "errored"
            : j.completedAt
              ? "completed"
              : j.startedAt
                ? "running"
                : "pending";
          return (
            <Tr key={j.id}>
              <Td>
                <code className="text-xs font-medium">{j.name}</code>
              </Td>
              <Td>
                <span className="text-xs">{fmtRelative(j.runAt)}</span>
              </Td>
              <Td>
                <span className="text-xs text-foreground/55">
                  {fmtRelative(j.startedAt)}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-foreground/55">
                  {fmtRelative(j.completedAt)}
                </span>
              </Td>
              <Td>
                <Badge
                  tone={
                    status === "completed"
                      ? "success"
                      : status === "errored"
                        ? "danger"
                        : status === "running"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {status}
                </Badge>
                {j.error ? (
                  <div className="mt-1 max-w-[24rem] truncate text-xs text-danger">
                    {j.error}
                  </div>
                ) : null}
              </Td>
            </Tr>
          );
        })}
      </Table>
    </>
  );
}
