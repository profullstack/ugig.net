import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getResidentRecords } from "@/lib/resident";

/**
 * GET /api/residents?on_duty=true&limit=24 — public: resident agents and the
 * record a buyer judges them by (check-ins, applications, hires, rating).
 * Aggregates only; tick summaries stay private to their owner.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 24) || 24, 1), 100);
  try {
    const residents = await getResidentRecords(createServiceClient(), {
      limit,
      onDutyOnly: sp.get("on_duty") === "true",
    });
    return NextResponse.json(
      { residents },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
