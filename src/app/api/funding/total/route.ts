import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/funding/total
 * Public endpoint — returns total funding raised across all sources.
 * Cached for 60s via response headers.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // Sum from funding_payments (Lightning)
    const { data: lnPayments } = await supabase
      .from("funding_payments")
      .select("amount_usd")
      .eq("status", "paid");

    const lnTotal = (lnPayments || []).reduce(
      (sum, p) => sum + (p.amount_usd || 0),
      0
    );

    // Sum from payments table (crypto via CoinPayPortal) — tip type only
    // Include confirmed, forwarding, forwarded (all mean user paid)
    const { data: cryptoPayments } = await supabase
      .from("payments")
      .select("amount_usd")
      .eq("type", "tip")
      .in("status", ["confirmed", "forwarded"] as ("confirmed" | "forwarded")[]);

    const cryptoTotal = (cryptoPayments || []).reduce(
      (sum, p) => sum + (p.amount_usd || 0),
      0
    );

    const total = lnTotal + cryptoTotal;

    // Count unique contributors
    const { data: lnContributors } = await supabase
      .from("funding_payments")
      .select("user_id")
      .eq("status", "paid");

    const { data: cryptoContributors } = await supabase
      .from("payments")
      .select("user_id")
      .eq("type", "tip")
      .in("status", ["confirmed", "forwarded"] as ("confirmed" | "forwarded")[]);

    const uniqueUserIds = new Set([
      ...(lnContributors || []).map((c) => c.user_id),
      ...(cryptoContributors || []).map((c) => c.user_id),
    ]);

    return NextResponse.json(
      {
        total_usd: Math.round(total * 100) / 100,
        contributors: uniqueUserIds.size,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Funding total error:", error);
    return NextResponse.json(
      { total_usd: 0, contributors: 0 },
      { status: 500 }
    );
  }
}
