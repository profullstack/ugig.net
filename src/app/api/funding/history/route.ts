import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

/**
 * GET /api/funding/history
 * Get the current user's funding contribution history.
 */
export async function GET(request: NextRequest) {
  try {
    // Session or full-access API key. Every query below filters by user.id.
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Get paid funding payments
    const { data: payments, error: paymentsError } = await supabase
      .from("funding_payments")
      .select("id, tier, amount_sats, amount_usd, status, paid_at, created_at")
      .eq("user_id", user.id)
      .in("status", ["paid", "pending"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (paymentsError) {
      return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }

    // Get credits balance and plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", user.id)
      .single();

    return NextResponse.json({
      payments: payments || [],
      credits: (profile?.credits as number) ?? 0,
      plan: subscription?.plan || "free",
      planStatus: subscription?.status || null,
    });
  } catch (error) {
    console.error("Funding history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
