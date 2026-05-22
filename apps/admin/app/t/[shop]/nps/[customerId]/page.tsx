import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitNps } from "@retainiq/db";
import { getDb } from "@/lib/db";
import { getCustomerForTracking } from "@/lib/tracking-queries";

export const dynamic = "force-dynamic";

async function handleSubmit(formData: FormData) {
  "use server";
  const customerId = String(formData.get("customerId") ?? "");
  const shop = String(formData.get("shop") ?? "");
  const score = Number.parseInt(String(formData.get("score") ?? "-1"), 10);
  if (!customerId || !shop || !Number.isFinite(score)) return;
  const db = await getDb();
  try {
    await submitNps(db, { customerId, score });
  } catch {
    /* ignore — bad input falls through */
  }
  redirect(`/t/${shop}/nps/${customerId}?submitted=1`);
}

export default async function NpsPage({
  params,
  searchParams,
}: {
  params: { shop: string; customerId: string };
  searchParams: { submitted?: string };
}) {
  const customer = await getCustomerForTracking(params.customerId);
  if (!customer || customer.shopDomain !== params.shop) notFound();
  const submitted = searchParams.submitted === "1";

  if (submitted || customer.npsScore != null) {
    return (
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-success-border bg-success-soft p-10 text-center text-success">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">
            Thank you!
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            Your feedback is in — we appreciate it.
          </h1>
          <p className="mt-3 text-sm">
            We&apos;ll keep improving based on responses like yours.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
          Quick favor
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          How likely are you to recommend {params.shop} to a friend?
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Pick a score from 0 (not likely) to 10 (extremely likely).
        </p>

        <form action={handleSubmit} className="mt-6 space-y-4">
          <input type="hidden" name="shop" value={params.shop} />
          <input type="hidden" name="customerId" value={customer.id} />
          <div className="grid grid-cols-11 gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <label
                key={n}
                className={`cursor-pointer rounded-lg border py-3 text-center text-sm font-semibold transition has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white ${
                  n <= 6
                    ? "border-danger/30 text-danger hover:bg-danger-soft"
                    : n <= 8
                      ? "border-warning/30 text-warning hover:bg-warning-soft"
                      : "border-teal-100 text-teal-600 hover:bg-teal-50"
                }`}
              >
                <input
                  type="radio"
                  name="score"
                  value={n}
                  required
                  className="sr-only"
                />
                {n}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-foreground-subtle">
            <span>Not likely</span>
            <span>Extremely likely</span>
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-hover"
          >
            Submit
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-foreground-subtle">
          <Link href="/" className="hover:text-brand">
            Back to dashboard
          </Link>
        </p>
      </section>
    </div>
  );
}
