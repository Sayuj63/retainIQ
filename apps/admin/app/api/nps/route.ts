import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getBootstrappedDb, submitNps } from "@retainiq/db";

const Body = z.object({
  customerId: z.string().uuid(),
  score: z.number().int().min(0).max(10),
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
    const result = await submitNps(db, parsed);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: { code: "NPS_REJECTED", message: msg, status: 400 } },
      { status: 400 },
    );
  }
}
