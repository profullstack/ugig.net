import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createBountySchema } from "@/lib/bounties";

// GET /api/bounties — public list of open bounties
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status") || "open";
    const defaultLimit = 50;

    const limitRaw = Number(params.get("limit"));
    const limitCandidate =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : defaultLimit;
    const limit = Math.min(limitCandidate, 100);

    const pageRaw = Number(params.get("page"));
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bounties" as any)
      .select(
        `
        id, title, description, payout_usd, payout_currency, max_submissions,
        status, closes_at, created_at,
        creator:profiles!creator_id (id, username, full_name, avatar_url)
      `
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/bounties — create a bounty
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const parsed = createBountySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Assign ids to any questions missing them
    const questions = parsed.data.questions.map((q) => ({
      ...q,
      id: q.id || randomUUID(),
    }));

    const { data, error } = await (supabase as any)
      .from("bounties")
      .insert({
        creator_id: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        payout_usd: parsed.data.payout_usd,
        payout_currency: parsed.data.payout_currency || "USD",
        payment_coin: parsed.data.payment_coin || null,
        max_submissions: parsed.data.max_submissions ?? null,
        closes_at: parsed.data.closes_at || null,
        questions,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
