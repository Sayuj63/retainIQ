import { type NextRequest, NextResponse } from "next/server";
import {
  eraseCustomer,
  eraseShop,
  getBootstrappedDb,
  ingestFulfillmentEvent,
  ingestOrderPaidEvent,
} from "@retainiq/db";
import { markShopUninstalled } from "@/lib/dashboard-queries";
import { verifyShopifyWebhook } from "@/lib/verify-shopify-webhook";

const GDPR_TOPICS = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "app/uninstalled",
]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const secret =
    process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_API_SECRET;
  if (secret) {
    const hmac = request.headers.get("x-shopify-hmac-sha256");
    if (!verifyShopifyWebhook(rawBody, hmac ?? undefined, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = await getBootstrappedDb();

  try {
    if (topic === "orders/paid" || topic === "orders/create") {
      if (!shopDomain) {
        return NextResponse.json(
          { error: "Missing shop domain header" },
          { status: 400 },
        );
      }
      await ingestOrderPaidEvent(db, shopDomain, parsed);
      return NextResponse.json({ received: true });
    }

    if (
      topic === "orders/fulfilled" ||
      topic === "orders/updated" ||
      topic === "fulfillments/create" ||
      topic === "fulfillments/update"
    ) {
      if (!shopDomain) {
        return NextResponse.json(
          { error: "Missing shop domain header" },
          { status: 400 },
        );
      }
      const result = await ingestFulfillmentEvent(db, shopDomain, parsed);
      return NextResponse.json({ received: true, updated: result.updated });
    }

    if (GDPR_TOPICS.has(topic)) {
      const body = parsed as {
        shop_domain?: string;
        customer?: { id?: number | string };
      };
      const domain = shopDomain ?? body.shop_domain;
      if (!domain) {
        return NextResponse.json(
          { error: "Missing shop domain" },
          { status: 400 },
        );
      }

      if (topic === "customers/data_request") {
        return NextResponse.json({ received: true, action: "data_request" });
      }
      if (topic === "customers/redact" && body.customer?.id != null) {
        await eraseCustomer(db, {
          shopDomain: domain,
          shopifyCustomerId: String(body.customer.id),
        });
        return NextResponse.json({ received: true, action: "customers_redact" });
      }
      if (topic === "shop/redact") {
        await eraseShop(db, domain);
        return NextResponse.json({ received: true, action: "shop_redact" });
      }
      if (topic === "app/uninstalled") {
        await markShopUninstalled(domain);
        return NextResponse.json({ received: true, action: "app_uninstalled" });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ received: true, ignored: topic });
}
