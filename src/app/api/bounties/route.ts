import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createBountySchema } from "@/lib/bounties";

const BOUNTY_STATUSES = ["open", "paused", "closed"] as const;
type BountyStatus = (typeof BOUNTY_STATUSES)[number];

// GET /api/bounties — public list of bounties
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const statusParam = params.get("status") || "open";
    if (!(BOUNTY_STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${BOUNTY_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const status = statusParam as BountyStatus;

    const defaultLimit = 50;
    const limitRaw = Number(params.get("limit"));
    if (params.get("limit") !== null && (!Number.isFinite(limitRaw) || limitRaw <= 0)) {
      return NextResponse.json(
        { error: "Invalid limit. Must be a positive integer." },
        { status: 400 }
      );
    }
    const limitCandidate =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : defaultLimit;
    const limit = Math.min(limitCandidate, 100);

    const pageRaw = Number(params.get("page"));
    if (params.get("page") !== null && (!Number.isFinite(pageRaw) || pageRaw <= 0)) {
      return NextResponse.json(
        { error: "Invalid page. Must be a positive integer." },
        { status: 400 }
      );
    }
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    const { data, error, count } = await supabase
      .from("bounties" as any)
      .select(
        `
        id, title, description, payout_usd, payout_currency, payment_coin,
        max_submissions, status, closes_at, questions, created_at, updated_at,
        creator:profiles!creator_id (id, username, full_name, avatar_url)
      `,
        { count: "exact" }
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[GET /api/bounties] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/bounties] Unexpected error:", err);
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
        {
          error: parsed.error.issues[0].message,
          issues: parsed.error.issues,
        },
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
      console.error("[POST /api/bounties] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/bounties] Unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
