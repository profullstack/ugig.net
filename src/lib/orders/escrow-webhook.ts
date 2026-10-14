/**
 * CoinPay escrow webhooks for Buy now orders.
 *
 * CoinPay identifies the escrow as `data.escrow_id`. Returns true when the
 * event belonged to a gig order (so the gig_escrows handlers can be skipped).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOrderParty, transitionOrder, type OrderStatus } from "@/lib/orders/buy-now";

interface EscrowWebhook {
  type: string;
  data: Record<string, unknown> & { metadata?: Record<string, unknown> };
}

interface OrderForWebhook {
  id: string;
  gig_id: string;
  buyer_id: string;
  seller_id: string;
  status: OrderStatus;
  amount_usd: number;
  platform_fee_usd: number;
}

export function escrowIdFromWebhook(payload: EscrowWebhook): string | null {
  const d = payload.data || {};
  const id = d.escrow_id ?? d.metadata?.coinpay_escrow_id ?? d.payment_id ?? d.id;
  return typeof id === "string" && id ? id : null;
}

export async function handleGigOrderEscrowEvent(
  supabase: SupabaseClient,
  payload: EscrowWebhook,
): Promise<boolean> {
  const escrowId = escrowIdFromWebhook(payload);
  if (!escrowId) return false;

  const { data } = await supabase
    .from("gig_orders")
    .select("id, gig_id, buyer_id, seller_id, status, amount_usd, platform_fee_usd")
    .eq("coinpay_escrow_id", escrowId)
    .maybeSingle();
  const order = data as OrderForWebhook | null;
  if (!order) return false;

  const now = new Date().toISOString();
  const ref = { gig_id: order.gig_id, order_id: order.id };

  switch (payload.type) {
    case "escrow.funded": {
      const moved = await transitionOrder(supabase, order.id, ["pending_payment", "expired"], {
        status: "funded",
        funded_at: now,
      });
      if (moved) {
        await notifyOrderParty(supabase, order.seller_id, "payment_received", "Order paid — start work",
          `The buyer paid $${order.amount_usd} into escrow. Deliver the work, then mark it delivered in Orders.`, ref);
        await notifyOrderParty(supabase, order.buyer_id, "gig_update", "Payment received",
          "Your payment is held in escrow. Release it from Orders once the work is delivered.", ref);
      }
      return true;
    }
    case "escrow.released":
    case "escrow.settled": {
      // Also how an untouched escrow auto-releases to the seller at expiry.
      const moved = await transitionOrder(supabase, order.id, ["funded", "delivered", "disputed"], {
        status: "released",
        released_at: now,
      });
      if (moved) {
        const net = Math.round((order.amount_usd - order.platform_fee_usd) * 100) / 100;
        await notifyOrderParty(supabase, order.seller_id, "payment_received", "Payment released",
          `$${net} has been released to your CoinPay wallet.`, ref);
      }
      return true;
    }
    case "escrow.refunded": {
      const moved = await transitionOrder(supabase, order.id, ["pending_payment", "funded", "delivered", "disputed"], {
        status: "refunded",
      });
      if (moved) {
        await notifyOrderParty(supabase, order.buyer_id, "payment_received", "Order refunded",
          "Your escrowed payment was refunded to your wallet.", ref);
      }
      return true;
    }
    case "escrow.expired": {
      await transitionOrder(supabase, order.id, ["pending_payment"], { status: "expired" });
      return true;
    }
    case "escrow.disputed": {
      await transitionOrder(supabase, order.id, ["funded", "delivered"], { status: "disputed" });
      return true;
    }
    default:
      return true;
  }
}

/**
 * A PayPal Buy now order is captured by CoinPay into ugig's PayPal and reported
 * as `payment.confirmed` with `payment_id` = the PayPal transaction id. Returns
 * true when the event belonged to an order.
 */
export async function handleGigOrderPaypalPayment(
  supabase: SupabaseClient,
  payload: EscrowWebhook,
): Promise<boolean> {
  const txId = payload.data?.payment_id;
  if (typeof txId !== "string" || !txId) return false;

  const { data } = await supabase
    .from("gig_orders")
    .select("id, gig_id, buyer_id, seller_id, status, amount_usd, platform_fee_usd")
    .eq("paypal_transaction_id", txId)
    .maybeSingle();
  const order = data as OrderForWebhook | null;
  if (!order) return false;

  if (payload.type === "payment.confirmed" || payload.type === "payment.forwarded") {
    const moved = await transitionOrder(supabase, order.id, ["pending_payment", "expired"], {
      status: "funded",
      funded_at: new Date().toISOString(),
    });
    if (moved) {
      const ref = { gig_id: order.gig_id, order_id: order.id };
      await notifyOrderParty(supabase, order.seller_id, "payment_received", "Order paid — start work",
        `The buyer paid $${order.amount_usd} by PayPal. Deliver the work, then mark it delivered in Orders.`, ref);
      await notifyOrderParty(supabase, order.buyer_id, "gig_update", "Payment received",
        "Your PayPal payment is held by ugig. Release it from Orders once the work is delivered.", ref);
    }
  } else if (payload.type === "payment.expired" || payload.type === "payment.failed") {
    await transitionOrder(supabase, order.id, ["pending_payment"], { status: "expired" });
  }
  return true;
}
