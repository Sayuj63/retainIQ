import Link from "next/link";
import { notFound } from "next/navigation";
import {
  existingReviewForOrder,
  getRecommendations,
  getTrackingOrder,
} from "@/lib/tracking-queries";
import {
  ProgressTimeline,
  TrackingHero,
  inferStage,
} from "@/components/tracking-ui";
import { fmtDate, fmtRelative } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  params,
}: {
  params: { shop: string; token: string };
}) {
  const order = await getTrackingOrder(params.shop, params.token);
  if (!order) notFound();

  const stage = inferStage(
    order.fulfillmentStatus,
    Boolean(order.trackingNumber),
    order.deliveredAt,
  );
  const isDelivered = stage === "delivered";
  const hoursSinceDelivery = order.deliveredAt
    ? (Date.now() - order.deliveredAt.getTime()) / 3_600_000
    : null;
  const reviewWindowOpen =
    hoursSinceDelivery != null && hoursSinceDelivery >= 0;

  const existingReview = await existingReviewForOrder(order.id);

  const ownedSkus = new Set(
    (order.lineItems ?? [])
      .map((li) => li.skuId ?? li.title)
      .filter(Boolean),
  );
  const recommendations = await getRecommendations(order.shopId, ownedSkus, 3);

  const eta =
    order.deliveredAt != null
      ? `Delivered ${fmtRelative(order.deliveredAt)}`
      : order.estimatedDelivery
        ? fmtDate(order.estimatedDelivery)
        : "Calculating…";
  const statusLabel = isDelivered
    ? "Delivered"
    : stage === "out_for_delivery"
      ? "Out for delivery"
      : stage === "shipped"
        ? "In transit"
        : stage === "packed"
          ? "Packed"
          : "Order received";

  const firstItem = order.lineItems[0];
  const orderSummary =
    order.lineItems.length === 1
      ? firstItem?.title
      : `${firstItem?.title} + ${order.lineItems.length - 1} more`;

  return (
    <div className="space-y-6">
      <TrackingHero
        title={`Order #${order.shopifyOrderId}`}
        subtitle={
          <>
            {orderSummary ?? "Your order"} ·{" "}
            <span className="text-foreground">{order.shopDomain}</span>
          </>
        }
        status={statusLabel}
        eta={eta}
      />

      <section className="rounded-3xl border border-border bg-surface p-8 shadow-soft">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
              Carrier
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {order.carrier ?? "Awaiting fulfillment"}
            </h2>
          </div>
          {order.trackingNumber ? (
            <code className="rounded-md border border-border bg-background-warm px-2 py-1 text-xs">
              {order.trackingNumber}
            </code>
          ) : null}
        </div>
        <ProgressTimeline current={stage} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-3xl border border-border bg-surface p-8 shadow-soft">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground-subtle">
            What&apos;s in this order
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {order.lineItems.map((li, i) => (
              <li key={i} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {li.title}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {li.skuId ?? "—"} · qty {li.qty}
                  </p>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  ${(Number(li.price) * li.qty).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
            <span className="text-foreground-muted">Order total</span>
            <span className="font-semibold text-foreground">
              {order.aov ?? "—"} {order.currency ?? ""}
            </span>
          </div>
        </section>

        <section className="rounded-3xl border border-purple-100 bg-brand-soft p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">
            What to expect
          </p>
          <ul className="mt-4 space-y-3 text-sm text-foreground">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-brand">●</span>
              Plant-based, fully recyclable packaging.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-brand">●</span>
              Carbon-neutral shipping on every order.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-brand">●</span>
              30-day satisfaction guarantee.
            </li>
          </ul>
        </section>
      </div>

      {isDelivered ? (
        existingReview ? (
          <section className="rounded-3xl border border-success-border bg-success-soft p-8 text-success">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em]">
              Thanks for your review
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              You rated this {existingReview.rating}★. We appreciate it.
            </h2>
          </section>
        ) : reviewWindowOpen ? (
          <section className="rounded-3xl border border-border bg-surface p-8 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
                  Rate your order
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  How was your {firstItem?.title}?
                </h2>
                <p className="mt-2 text-sm text-foreground-muted">
                  Tap a star — takes under a minute.
                </p>
              </div>
              <Link
                href={`/t/${params.shop}/review/${order.id}`}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-hover"
              >
                Leave a review →
              </Link>
            </div>
          </section>
        ) : null
      ) : null}

      {recommendations.length > 0 ? (
        <section className="rounded-3xl border border-border bg-surface p-8 shadow-soft">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground-subtle">
            You might also like
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            Best-sellers picked for you
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {recommendations.map((r) => (
              <li
                key={r.sku ?? r.title}
                className="rounded-2xl border border-border bg-background-warm p-4"
              >
                <p className="text-xs uppercase tracking-wide text-foreground-subtle">
                  {r.sku ?? "—"}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {r.title}
                </p>
                <p className="mt-3 text-xs text-foreground-muted">
                  {r.popularity} bought recently
                </p>
                <button
                  type="button"
                  className="mt-4 w-full rounded-md border border-brand-muted bg-surface px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft"
                >
                  Add to next order
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.customerId ? (
        <section className="rounded-3xl border border-teal-100 bg-teal-50 p-8 text-teal-800">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-600">
                Refer a friend
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Get $10 — give $10
              </h2>
              <p className="mt-1 text-sm">
                Share your link and you&apos;ll both earn store credit on your next
                order.
              </p>
            </div>
            <code className="rounded-lg border border-teal-100 bg-white px-3 py-2 text-xs text-teal-800">
              {order.shopDomain}/refer?c={order.customerId.slice(0, 8)}
            </code>
          </div>
        </section>
      ) : null}
    </div>
  );
}
