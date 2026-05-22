/**
 * Review capture + routing (PRD §5.4.1, §5.4.2).
 *
 * The customer-facing review collector posts here; we route by rating:
 *   5★ → auto-publish to storefront + Google + Meta
 *   4★ → auto-publish to storefront
 *   3★ → opens a support ticket (stubbed), merchant alert
 *   1–2★ → no publish, urgent merchant alert + recovery queued
 */

import { eq } from "drizzle-orm";
import type { DrizzleDb } from "./create-db";
import { customers } from "./schema/customers";
import { orders } from "./schema/orders";
import { reviews } from "./schema/reviews";
import { enqueueJob } from "./job-queue";

export type SubmitReviewInput = {
  customerId: string;
  orderId?: string;
  skuId?: string;
  rating: number;
  bodyText?: string;
  ugcUrls?: string[];
};

export type RoutedReview = {
  reviewId: string;
  rating: number;
  publishedTo: string[];
  routedTo: string | null;
  supportTicketId: string | null;
};

function routeByRating(rating: number): {
  published: boolean;
  publishedTo: string[];
  routedTo: string | null;
  sentiment: "positive" | "neutral" | "negative";
} {
  if (rating >= 5) {
    return {
      published: true,
      publishedTo: ["storefront", "google", "meta"],
      routedTo: null,
      sentiment: "positive",
    };
  }
  if (rating === 4) {
    return {
      published: true,
      publishedTo: ["storefront"],
      routedTo: null,
      sentiment: "positive",
    };
  }
  if (rating === 3) {
    return {
      published: false,
      publishedTo: [],
      routedTo: "support_queue",
      sentiment: "neutral",
    };
  }
  return {
    published: false,
    publishedTo: [],
    routedTo: "recovery_queue",
    sentiment: "negative",
  };
}

export async function submitReview(
  db: DrizzleDb,
  input: SubmitReviewInput,
): Promise<RoutedReview> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("rating must be an integer between 1 and 5");
  }

  const [customer] = await db
    .select({ id: customers.id, shopId: customers.shopId })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) throw new Error("Unknown customer");

  if (input.orderId) {
    const [order] = await db
      .select({ id: orders.id, shopId: orders.shopId })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) throw new Error("Unknown order");
    if (order.shopId !== customer.shopId) {
      throw new Error("Order does not belong to customer's shop");
    }
  }

  const routing = routeByRating(input.rating);
  const supportTicketId =
    input.rating <= 3 ? `tkt_${Date.now().toString(36)}` : null;

  const [row] = await db
    .insert(reviews)
    .values({
      shopId: customer.shopId,
      customerId: customer.id,
      orderId: input.orderId,
      skuId: input.skuId,
      rating: input.rating,
      bodyText: input.bodyText,
      sentiment: routing.sentiment,
      hasUgc: Boolean(input.ugcUrls && input.ugcUrls.length > 0),
      ugcUrls: input.ugcUrls,
      published: routing.published,
      publishedAt: routing.published ? new Date() : null,
      publishedTo: routing.publishedTo.length ? routing.publishedTo : null,
      routedTo: routing.routedTo,
      supportTicketId,
    })
    .returning();
  if (!row) throw new Error("Review insert failed");

  if (input.rating <= 2) {
    await enqueueJob(
      db,
      "review-recovery-alert",
      {
        reviewId: row.id,
        shopId: customer.shopId,
        customerId: customer.id,
        rating: input.rating,
        ticketId: supportTicketId,
      },
      new Date(),
    );
  }

  return {
    reviewId: row.id,
    rating: input.rating,
    publishedTo: routing.publishedTo,
    routedTo: routing.routedTo,
    supportTicketId,
  };
}

export type NpsInput = {
  customerId: string;
  score: number;
};

export type NpsResult = {
  customerId: string;
  score: number;
  category: "promoter" | "passive" | "detractor";
  followUpQueued: boolean;
};

function npsCategory(s: number): NpsResult["category"] {
  if (s >= 9) return "promoter";
  if (s >= 7) return "passive";
  return "detractor";
}

export async function submitNps(
  db: DrizzleDb,
  input: NpsInput,
): Promise<NpsResult> {
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) {
    throw new Error("nps score must be an integer between 0 and 10");
  }

  const [customer] = await db
    .select({ id: customers.id, shopId: customers.shopId })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) throw new Error("Unknown customer");

  const now = new Date();
  await db
    .update(customers)
    .set({ npsScore: input.score, npsSubmittedAt: now })
    .where(eq(customers.id, customer.id));

  const category = npsCategory(input.score);
  let followUpQueued = false;
  if (category === "detractor") {
    await enqueueJob(
      db,
      "nps-detractor-followup",
      {
        customerId: customer.id,
        shopId: customer.shopId,
        score: input.score,
      },
      new Date(Date.now() + 60_000),
    );
    followUpQueued = true;
  } else if (category === "promoter") {
    await enqueueJob(
      db,
      "nps-promoter-referral",
      {
        customerId: customer.id,
        shopId: customer.shopId,
        score: input.score,
      },
      new Date(Date.now() + 60_000),
    );
    followUpQueued = true;
  }

  return {
    customerId: customer.id,
    score: input.score,
    category,
    followUpQueued,
  };
}
