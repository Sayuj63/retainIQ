import { NextResponse, type NextRequest } from "next/server";
import { getReplenishmentForecast } from "@/lib/dashboard-queries";

export async function GET(request: NextRequest) {
  const windowParam = request.nextUrl.searchParams.get("window");
  const windowDays = windowParam
    ? Math.min(180, Math.max(1, Number.parseInt(windowParam, 10) || 30))
    : 30;
  const rows = await getReplenishmentForecast(windowDays);
  return NextResponse.json({
    window_days: windowDays,
    count: rows.length,
    forecast: rows.map((r) => ({
      customer_id: r.customerId,
      shopify_customer_id: r.shopifyCustomerId,
      sku: r.sku,
      predicted_at: r.predictedAt.toISOString(),
    })),
  });
}
