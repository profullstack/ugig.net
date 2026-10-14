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
