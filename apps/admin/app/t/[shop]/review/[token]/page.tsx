import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitReview } from "@retainiq/db";
import { getDb } from "@/lib/db";
import {
  existingReviewForOrder,
  getTrackingOrder,
} from "@/lib/tracking-queries";

export const dynamic = "force-dynamic";

async function handleSubmit(formData: FormData) {
  "use server";
  const shop = String(formData.get("shop") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const rating = Number.parseInt(String(formData.get("rating") ?? "0"), 10);
  const bodyText = String(formData.get("body") ?? "").slice(0, 4000);

  if (!shop || !orderId || !Number.isFinite(rating)) return;

  const order = await getTrackingOrder(shop, orderId);
  if (!order || !order.customerId) return;

  const db = await getDb();
  try {
    await submitReview(db, {
      customerId: order.customerId,
      orderId: order.id,
      rating,
      bodyText: bodyText || undefined,
    });
  } catch {
    /* swallow — existence/already-submitted handled by redirect */
  }
  redirect(`/t/${shop}/orders/${orderId}`);
}

export default async function ReviewPage({
  params,
}: {
  params: { shop: string; token: string };
}) {
  const order = await getTrackingOrder(params.shop, params.token);
  if (!order) notFound();

  const already = await existingReviewForOrder(order.id);
  if (already) {
    redirect(`/t/${params.shop}/orders/${params.token}`);
  }

  const firstItem = order.lineItems[0];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/t/${params.shop}/orders/${params.token}`}
        className="text-xs font-medium text-foreground-muted hover:text-brand"
      >
        ← Back to order
      </Link>
      <section className="mt-4 rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
          Rate your order
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          How was your {firstItem?.title ?? "order"}?
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Order #{order.shopifyOrderId} · {order.shopDomain}
        </p>

        <form action={handleSubmit} className="mt-6 space-y-5">
          <input type="hidden" name="shop" value={params.shop} />
          <input type="hidden" name="orderId" value={order.id} />

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
              Your rating
            </legend>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((r) => (
                <label
                  key={r}
                  className="group cursor-pointer rounded-xl border border-border bg-background-warm p-3 text-center text-xl transition hover:border-brand hover:bg-brand-soft has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand"
                >
                  <input
                    type="radio"
                    name="rating"
                    value={r}
                    required
                    className="sr-only"
                  />
                  <span className="block">{"★".repeat(r)}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-foreground-subtle group-has-[:checked]:text-brand">
                    {r}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="body"
              className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground-subtle"
            >
              Tell us more <span className="font-normal lowercase">(optional)</span>
            </label>
            <textarea
              id="body"
              name="body"
              rows={4}
              maxLength={4000}
              placeholder="What did you love? What could be better?"
              className="mt-2 w-full rounded-xl border border-border bg-background-warm p-3 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-hover"
          >
            Submit review
          </button>
        </form>
      </section>
    </div>
  );
}
