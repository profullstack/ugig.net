import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentStatus } from "@/lib/coinpayportal";

/**
 * GET /api/payments/coinpayportal/status?payment_id=X
 *
 * Poll payment status — checks CoinPayPortal API directly,
 * falls back to local DB if the external call fails.
 */
export async function GET(request: NextRequest) {
  try {
    const paymentId = request.nextUrl.searchParams.get("payment_id");
    if (!paymentId) {
      return NextResponse.json(
        { error: "payment_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the payment belongs to this user
    const { data: payment, error } = await supabase
      .from("payments")
      .select("id, coinpay_payment_id, status, updated_at")
      .eq("id", paymentId)
      .eq("user_id", user.id)
      .single();

    if (error || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // If already in terminal state locally, return it
    const terminalStatuses = ["forwarded", "failed", "expired", "forwarding_failed"];
    if (terminalStatuses.includes(payment.status)) {
      return NextResponse.json({
        status: payment.status,
        updated_at: payment.updated_at,
      });
    }

    // Poll CoinPayPortal API for real-time status
    if (payment.coinpay_payment_id) {
      try {
        const cpStatus = await getPaymentStatus(payment.coinpay_payment_id);
        if (cpStatus.success && cpStatus.payment) {
          const liveStatus = cpStatus.payment.status;

          // Update local DB if status changed
          if (liveStatus && liveStatus !== payment.status) {
            await supabase
              .from("payments")
              .update({
                status: liveStatus as "pending" | "confirmed" | "forwarded" | "expired" | "failed",
                updated_at: new Date().toISOString(),
              })
              .eq("id", paymentId);
          }

          return NextResponse.json({
            status: liveStatus || payment.status,
            tx_hash: cpStatus.payment.tx_hash,
            updated_at: payment.updated_at,
          });
        }
      } catch (cpError) {
        console.error("CoinPayPortal status check failed:", cpError);
        // Fall through to return local DB state
      }
    }

    return NextResponse.json({
      status: payment.status,
      updated_at: payment.updated_at,
    });
  } catch (error) {
    console.error("Payment status error:", error);
    return NextResponse.json(
      { error: "Failed to check payment status" },
      { status: 500 }
    );
  }
}
