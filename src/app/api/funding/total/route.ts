import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

interface FundingTotal {
  total_usd: number;
  contributors: number;
}

/**
 * Every page with the funding widget polls this, and the answer is the same
 * for everyone, so it is memoised here for 30s. This is the only polled
 * endpoint safe to share: it takes no request and does no auth. Per-user
 * endpoints (wallet, notifications) must never be cached across callers.
 */
const MEMO_TTL_MS = 30_000;
let memo: { at: number; value: FundingTotal } | null = null;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

/**
 * GET /api/funding/total
 * Public — returns total CoinPay funding raised. DB-backed sum, no fallback.
 */
export async function GET() {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) {
    return NextResponse.json(memo.value, { headers: CACHE_HEADERS });
  }

  try {
    const supabase = createServiceClient();

    const { data: payments, error } = (await (supabase.from("funding_payments") as any)
      .select("amount_usd, user_id, contributor_email")
      .in("status", ["paid", "confirmed", "forwarded"])
      .not("coinpay_payment_id", "is", null)) as { data: any[] | null; error?: unknown };

    const rows = payments || [];
    const total = rows.reduce(
      (sum, p) => sum + (Number(p.amount_usd) || 0),
      0
    );
    const contributorKeys = new Set(
      rows.map((p) => p.user_id || p.contributor_email).filter(Boolean)
    );

    const value: FundingTotal = {
      total_usd: Math.round(total * 100) / 100,
      contributors: contributorKeys.size,
    };
    // A failed query reads as zero; do not pin that for 30s.
    if (!error) memo = { at: Date.now(), value };

    return NextResponse.json(value, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Funding total error:", error);
    return NextResponse.json(
      { total_usd: 0, contributors: 0 },
      { status: 500 }
    );
  }
}
