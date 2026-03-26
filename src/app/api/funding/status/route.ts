import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/funding/status?paymentHash=xxx
 * Poll payment status for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentHash = request.nextUrl.searchParams.get("paymentHash");
    if (!paymentHash) {
      return NextResponse.json({ error: "paymentHash required" }, { status: 400 });
    }

    const { data: payment, error } = await supabase
      .from("funding_payments")
      .select("id, status, tier, amount_sats, amount_usd, paid_at, expires_at, created_at")
      .eq("payment_hash", paymentHash)
      .eq("user_id", user.id)
      .single();

    if (error || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Check if expired
    if (payment.status === "pending" && new Date(payment.expires_at) < new Date()) {
      return NextResponse.json({ ...payment, status: "expired" });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Funding status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
