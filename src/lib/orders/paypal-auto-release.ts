import type { SupabaseClient } from "@supabase/supabase-js";
import { ORDER_ESCROW_HOURS, releasePaypalOrder, type OrderRow } from "@/lib/orders/buy-now";

/** An abandoned PayPal checkout stops counting as an open order after this. */
const PAYPAL_CHECKOUT_TTL_HOURS = 24;

/**
 * Crypto orders auto-release inside CoinPay escrow; PayPal orders are held by
 * ugig, so this does the same thing for them: a paid order untouched for the
 * escrow window releases to the seller (payout owed). Disputed orders are left
 * for an admin.
 */
export async function autoReleasePaypalOrders(
  supabase: SupabaseClient,
  now: Date = new Date(),
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<{ due: number; released: number; expired: number }> {
  const releaseBefore = new Date(now.getTime() - ORDER_ESCROW_HOURS * 3600_000).toISOString();
  const checkoutBefore = new Date(now.getTime() - PAYPAL_CHECKOUT_TTL_HOURS * 3600_000).toISOString();

  const { data: due } = await supabase
    .from("gig_orders")
    .select("id, gig_id, seller_id, amount_usd, platform_fee_usd")
    .eq("payment_rail", "paypal")
    .in("status", ["funded", "delivered"])
    .lt("funded_at", releaseBefore)
    .limit(500);
  const dueRows = (due ?? []) as Pick<OrderRow, "id" | "gig_id" | "seller_id" | "amount_usd" | "platform_fee_usd">[];

  let released = 0;
  let expired = 0;
  if (!dryRun) {
    for (const order of dueRows) {
      if (await releasePaypalOrder(supabase, order, "auto")) released++;
    }
    const { data: stale } = await supabase
      .from("gig_orders")
      .update({ status: "expired" })
      .eq("payment_rail", "paypal")
      .eq("status", "pending_payment")
      .lt("created_at", checkoutBefore)
      .select("id");
    expired = stale?.length ?? 0;
  }
  return { due: dueRows.length, released, expired };
}
