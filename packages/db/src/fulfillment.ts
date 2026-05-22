/**
 * Fulfillment ingest (PRD §5.5 / §6.3).
 *
 * Accepts the Shopify `orders/fulfilled` and `fulfillments/update` webhook
 * shapes and stores the tracking number, carrier, ETA, and delivered_at so
 * the branded-tracking page and the T+72h review request can render correctly.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDb } from "./create-db";
import { orders } from "./schema/orders";
import { shops } from "./schema/shops";

const FulfillmentSchema = z.object({
  order_id: z.union([z.number(), z.string()]).optional(),
  id: z.union([z.number(), z.string()]).optional(),
  status: z.string().optional(),
  shipment_status: z.string().optional(),
  tracking_number: z.string().optional(),
  tracking_company: z.string().optional(),
  estimated_delivery_at: z.string().optional(),
  delivered_at: z.string().optional(),
});

const OrderFulfilledSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  fulfillment_status: z.string().optional(),
  fulfillments: z.array(FulfillmentSchema).optional(),
});

export async function ingestFulfillmentEvent(
  db: DrizzleDb,
  shopDomain: string,
  rawPayload: unknown,
): Promise<{ updated: number }> {
  const payload = OrderFulfilledSchema.parse(rawPayload ?? {});
  const fulfillment = payload.fulfillments?.[0];
  const shopifyOrderId =
    payload.id != null
      ? String(payload.id)
      : fulfillment?.order_id != null
        ? String(fulfillment.order_id)
        : null;
  if (!shopifyOrderId) return { updated: 0 };

  const [shop] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.shopifyDomain, shopDomain))
    .limit(1);
  if (!shop) return { updated: 0 };

  const trackingNumber = fulfillment?.tracking_number ?? null;
  const carrier = fulfillment?.tracking_company ?? null;
  const eta = fulfillment?.estimated_delivery_at
    ? new Date(fulfillment.estimated_delivery_at)
    : null;
  const deliveredAt =
    fulfillment?.shipment_status === "delivered" ||
    fulfillment?.delivered_at != null
      ? fulfillment?.delivered_at
        ? new Date(fulfillment.delivered_at)
        : new Date()
      : null;
  const status = deliveredAt
    ? "delivered"
    : fulfillment?.shipment_status ?? payload.fulfillment_status ?? "in_transit";

  const update: Record<string, unknown> = { fulfillmentStatus: status };
  if (trackingNumber) update.trackingNumber = trackingNumber;
  if (carrier) update.carrier = carrier;
  if (eta && !Number.isNaN(eta.getTime())) update.estimatedDelivery = eta;
  if (deliveredAt && !Number.isNaN(deliveredAt.getTime())) {
    update.deliveredAt = deliveredAt;
  }

  const result = await db
    .update(orders)
    .set(update)
    .where(
      and(
        eq(orders.shopId, shop.id),
        eq(orders.shopifyOrderId, shopifyOrderId),
      ),
    )
    .returning();

  return { updated: result.length };
}
