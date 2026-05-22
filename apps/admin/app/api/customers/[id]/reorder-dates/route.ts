import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { customers, getBootstrappedDb } from "@retainiq/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const db = await getBootstrappedDb();
  const [c] = await db
    .select({
      id: customers.id,
      predictedReorder: customers.predictedReorder,
    })
    .from(customers)
    .where(eq(customers.id, params.id))
    .limit(1);
  if (!c) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Customer not found", status: 404 } },
      { status: 404 },
    );
  }
  const map = (c.predictedReorder ?? {}) as Record<string, string>;
  return NextResponse.json({
    customer_id: c.id,
    reorder_dates: Object.entries(map).map(([sku, iso]) => ({
      sku,
      predicted_at: iso,
    })),
  });
}
