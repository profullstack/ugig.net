/**
 * PayPal as a seller payout method (2026-10-19).
 *
 * Buy now's PayPal/card rail captures into ugig's own PayPal; an admin pays the
 * seller when the order is released (/admin/payouts). A seller with no crypto
 * wallet can save a PayPal email (table seller_payout_settings, private) and is
 * then buyable by card or PayPal only, paid to that address. When a seller has
 * both, a PayPal-paid order pays out to PayPal (no conversion either way).
 */
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

export const paypalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter the email address of your PayPal account");

export function isPaypalEmail(value: unknown): value is string {
  return paypalEmailSchema.safeParse(value).success;
}

/** "l***@ilands.app": enough for its owner to recognise, not enough to mail. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** The seller's saved PayPal payout email, or null. Never throws. */
export async function loadPaypalPayoutEmail(sellerId: string): Promise<string | null> {
  try {
    const { data } = await createServiceClient()
      .from("seller_payout_settings" as never)
      .select("paypal_email")
      .eq("user_id", sellerId)
      .maybeSingle();
    const email = (data as { paypal_email?: string | null } | null)?.paypal_email ?? null;
    return email && isPaypalEmail(email) ? email : null;
  } catch (error) {
    console.error("[paypal payout] lookup failed:", error);
    return null;
  }
}

/** Save (or clear, with null) the seller's PayPal payout email. */
export async function savePaypalPayoutEmail(userId: string, email: string | null): Promise<void> {
  const { error } = await createServiceClient()
    .from("seller_payout_settings" as never)
    .upsert({ user_id: userId, paypal_email: email, updated_at: new Date().toISOString() } as never, {
      onConflict: "user_id",
    });
  if (error) throw new Error(error.message);
}

/**
 * Hide a PayPal payout email from anyone but the seller. Orders carry the
 * payout destination in seller_payout_address; a wallet address is public on
 * chain anyway, an email is not.
 */
export function maskOrderPayout<T extends Record<string, unknown>>(order: T, viewerId: string): T {
  if (order.payout_currency !== "paypal" || order.seller_id === viewerId) return order;
  return { ...order, seller_payout_address: "PayPal" };
}
