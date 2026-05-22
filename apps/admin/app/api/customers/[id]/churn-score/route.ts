import { NextResponse } from "next/server";
import { getCustomerScore } from "@/lib/dashboard-queries";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const c = await getCustomerScore(params.id);

  if (!c) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Customer not found", status: 404 } },
      { status: 404 },
    );
  }

  const featuresWrap = c.churnScoreFeatures as
    | { features?: unknown[]; action?: string }
    | null
    | undefined;

  return NextResponse.json({
    customer_id: c.id,
    score: c.churnScore != null ? Number(c.churnScore) : null,
    segment: c.segment,
    computed_at: c.churnScoreUpdatedAt,
    top_features: featuresWrap?.features ?? [],
    action_queued: featuresWrap?.action ?? null,
  });
}
