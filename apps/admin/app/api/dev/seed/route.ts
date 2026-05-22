import { NextResponse } from "next/server";
import {
  dispatchStep,
  ingestFulfillmentEvent,
  ingestOrderPaidEvent,
  planPostPurchaseFlow,
  processDueJobs,
  seedDefaultFlowsForShop,
  shops,
  submitNps,
  submitReview,
} from "@retainiq/db";
import { getDb } from "@/lib/db";
import { optInAllCustomersForShop } from "@/lib/dashboard-queries";
import { getStubProviders } from "@/lib/providers";

const DEMO_SHOP = "demo-store.myshopify.com";

const DAY = 86_400_000;

const SAMPLE_ORDERS: Array<{
  id: number;
  daysAgo: number;
  total: string;
  discount: boolean;
  items: { title: string; qty: number; price: string; sku: string }[];
  customer: { id: number; email: string };
}> = [
  // Repeat coffee buyer (3 priors) — replenishment kicks in
  { id: 200001, daysAgo: 90, total: "39.50", discount: false, items: [{ title: "Cold Brew Concentrate", qty: 2, price: "19.75", sku: "BRW-32" }], customer: { id: 2001, email: "ava@example.com" } },
  { id: 200002, daysAgo: 60, total: "39.50", discount: false, items: [{ title: "Cold Brew Concentrate", qty: 2, price: "19.75", sku: "BRW-32" }], customer: { id: 2001, email: "ava@example.com" } },
  { id: 200003, daysAgo: 30, total: "39.50", discount: false, items: [{ title: "Cold Brew Concentrate", qty: 2, price: "19.75", sku: "BRW-32" }], customer: { id: 2001, email: "ava@example.com" } },
  // Collagen subscriber-style
  { id: 200004, daysAgo: 80, total: "129.00", discount: false, items: [{ title: "Collagen Powder", qty: 1, price: "129.00", sku: "COL-120" }], customer: { id: 2002, email: "ben@example.com" } },
  { id: 200005, daysAgo: 40, total: "129.00", discount: false, items: [{ title: "Collagen Powder", qty: 1, price: "129.00", sku: "COL-120" }], customer: { id: 2002, email: "ben@example.com" } },
  // Discount-heavy, low-AOV buyer → high churn risk
  { id: 200006, daysAgo: 5, total: "8.00", discount: true, items: [{ title: "Tea Sampler", qty: 1, price: "8.00", sku: "TEA-S" }], customer: { id: 2003, email: "cleo@example.com" } },
  { id: 200007, daysAgo: 2, total: "12.00", discount: true, items: [{ title: "Mints", qty: 4, price: "3.00", sku: "MNT-12" }], customer: { id: 2004, email: "dax@example.com" } },
  // High-value buyer
  { id: 200008, daysAgo: 1, total: "229.00", discount: false, items: [{ title: "Sleep Tincture", qty: 1, price: "229.00", sku: "SLP-30" }], customer: { id: 2005, email: "eli@example.com" } },
];

export async function GET() {
  return seed();
}
export async function POST() {
  return seed();
}

async function seed() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seeding disabled in production" },
      { status: 403 },
    );
  }

  const prevPostPurchase = process.env.RETAINIQ_POST_PURCHASE_DELAY_MS;
  const prevFlowScale = process.env.RETAINIQ_FLOW_DELAY_SCALE;
  process.env.RETAINIQ_POST_PURCHASE_DELAY_MS = "0";
  process.env.RETAINIQ_FLOW_DELAY_SCALE = "0";

  try {
    const db = await getDb();
    const [shop] = await db
      .insert(shops)
      .values({
        shopifyDomain: DEMO_SHOP,
        accessToken: "demo-token",
        planTier: "growth",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [shops.shopifyDomain],
        set: { isActive: true },
      })
      .returning();

    if (shop) await seedDefaultFlowsForShop(db, shop.id);

    // Ingest in chronological order so per-customer history is correctly sequenced.
    const sorted = [...SAMPLE_ORDERS].sort((a, b) => b.daysAgo - a.daysAgo);
    const ingested: { customerId: string; orderId: string }[] = [];
    for (const o of sorted) {
      const r = await ingestOrderPaidEvent(db, DEMO_SHOP, {
        id: o.id,
        currency: "USD",
        total_price: o.total,
        discount_codes: o.discount ? [{ code: "SAVE10" }] : [],
        customer: o.customer,
        line_items: o.items.map((i) => ({
          title: i.title,
          quantity: i.qty,
          price: i.price,
          sku: i.sku,
        })),
      });
      ingested.push({
        customerId: r.customerRowId,
        orderId: r.orderRowId,
      });
    }

    if (shop) await optInAllCustomersForShop(shop.id);

    // Fulfill some orders so the tracking page has progress states to render.
    const fulfillMap: Array<{
      orderId: number;
      status: "in_transit" | "delivered";
    }> = [
      { orderId: 200003, status: "delivered" }, // delivered → review CTA
      { orderId: 200005, status: "delivered" }, // delivered → review CTA
      { orderId: 200007, status: "in_transit" },
      { orderId: 200008, status: "in_transit" },
    ];
    const carriers = ["DHL", "FedEx", "UPS", "Delhivery"];
    for (let i = 0; i < fulfillMap.length; i++) {
      const f = fulfillMap[i]!;
      await ingestFulfillmentEvent(db, DEMO_SHOP, {
        id: f.orderId,
        fulfillment_status: f.status === "delivered" ? "delivered" : "in_transit",
        fulfillments: [
          {
            tracking_number: `1Z${(f.orderId * 31).toString(36).toUpperCase()}`,
            tracking_company: carriers[i % carriers.length],
            shipment_status: f.status,
            estimated_delivery_at: new Date(
              Date.now() + (f.status === "delivered" ? -1 : 3) * 86_400_000,
            ).toISOString(),
            delivered_at:
              f.status === "delivered"
                ? new Date(Date.now() - 86_400_000).toISOString()
                : undefined,
          },
        ],
      });
    }

    // Drain post-purchase + dispatch jobs synchronously for demo visibility.
    const providers = getStubProviders();
    const handlers = {
      "post-purchase": async (payload: Record<string, unknown>) => {
        await planPostPurchaseFlow(db, {
          shopId: String(payload.shopId),
          orderId: String(payload.orderId),
        });
      },
      "dispatch-step": async (payload: Record<string, unknown>) => {
        await dispatchStep(db, providers, payload);
      },
      "replenishment-reminder": async () => {
        /* leave for the running worker */
      },
      "review-recovery-alert": async () => {},
      "nps-detractor-followup": async () => {},
      "nps-promoter-referral": async () => {},
    };
    for (let i = 0; i < 8; i++) {
      const done = await processDueJobs(db, handlers, { limit: 500 });
      if (done === 0) break;
    }

    // Seed some review + NPS responses so those pages aren't empty on demo.
    const seen = new Set<string>();
    for (let i = 0; i < ingested.length && seen.size < 4; i++) {
      const { customerId, orderId } = ingested[i]!;
      if (seen.has(customerId)) continue;
      seen.add(customerId);
      const rating = ((i + 1) % 5) + 1; // 2,3,4,5
      try {
        await submitReview(db, {
          customerId,
          orderId,
          rating,
          bodyText:
            rating === 5
              ? "Absolutely love it!"
              : rating === 4
                ? "Great — quick delivery."
                : rating === 3
                  ? "Sizing was a bit off."
                  : "Arrived damaged.",
        });
      } catch {
        /* ignore */
      }
      try {
        await submitNps(db, {
          customerId,
          score: rating === 5 ? 10 : rating === 4 ? 8 : rating === 3 ? 6 : 3,
        });
      } catch {
        /* ignore */
      }
    }
  } finally {
    if (prevPostPurchase != null) {
      process.env.RETAINIQ_POST_PURCHASE_DELAY_MS = prevPostPurchase;
    } else {
      delete process.env.RETAINIQ_POST_PURCHASE_DELAY_MS;
    }
    if (prevFlowScale != null) {
      process.env.RETAINIQ_FLOW_DELAY_SCALE = prevFlowScale;
    } else {
      delete process.env.RETAINIQ_FLOW_DELAY_SCALE;
    }
  }

  return NextResponse.redirect(new URL("/", baseUrl()));
}

function baseUrl(): string {
  return process.env.SHOPIFY_APP_URL ?? "http://localhost:3000";
}

// Suppress an unused-warning for DAY (kept as documentation of expected ms scale).
void DAY;
