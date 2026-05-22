import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getBootstrappedDb, submitReview } from "@retainiq/db";

const Body = z.object({
  customerId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  skuId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  bodyText: z.string().max(4000).optional(),
  ugcUrls: z.array(z.string().url()).max(10).optional(),
});

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: msg, status: 400 } },
      { status: 400 },
    );
  }
  const db = await getBootstrappedDb();
  try {
    const result = await submitReview(db, parsed);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: "REVIEW_REJECTED", message: msg, status: 400 } },
      { status: 400 },
    );
  }
}
