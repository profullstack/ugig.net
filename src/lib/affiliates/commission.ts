import { SupabaseClient } from "@supabase/supabase-js";
import { AFFILIATE_DEFAULTS, PLATFORM_WALLET_USER_ID } from "@/lib/constants";

type AnySupabase = any;


export interface AffiliateOffer {
  id: string;
  seller_id: string;
  commission_rate: number;
  commission_type: string;
  commission_flat_sats: number;
  price_sats: number;
  settlement_delay_days: number;
}

export interface CommissionResult {
  ok: boolean;
  conversion_id?: string;
  commission_sats?: number;
  settles_at?: string;
  error?: string;
}

async function findConversionByPurchaseId(
  admin: SupabaseClient,
  purchaseId?: string
): Promise<CommissionResult | null> {
  if (!purchaseId) return null;

  const { data, error } = await (admin as AnySupabase)
    .from("affiliate_conversions")
    .select("id, commission_sats, settles_at")
    .eq("purchase_id", purchaseId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to check existing affiliate conversion:", error);
    return null;
  }

  if (!data) return null;

  return {
    ok: true,
    conversion_id: data.id,
    commission_sats: data.commission_sats,
    settles_at: data.settles_at,
  };
}

/**
 * Calculate commission for a sale.
 */
export function calculateCommission(
  offer: Pick<AffiliateOffer, "commission_rate" | "commission_type" | "commission_flat_sats">,
  saleAmountSats: number
): number {
  if (offer.commission_type === "flat") {
    return offer.commission_flat_sats || 0;
  }
  return Math.floor(saleAmountSats * offer.commission_rate);
}

/**
 * Calculate platform fee on a commission (platform takes a cut of the commission, not the sale).
 */
export function calculatePlatformFee(commissionSats: number): number {
  return Math.floor(commissionSats * AFFILIATE_DEFAULTS.platformFeeRate);
}

/**
 * Record a conversion and create a pending commission.
 * Does NOT pay out — commissions sit in pending until settlement_delay_days pass.
 */
export async function recordConversion(
  admin: SupabaseClient,
  params: {
    offerId: string;
    affiliateId: string;
    buyerId?: string;
    clickId?: string;
    purchaseId?: string;
    saleAmountSats: number;
  }
): Promise<CommissionResult> {
  const { offerId, affiliateId, buyerId, clickId, purchaseId, saleAmountSats } = params;

  const existing = await findConversionByPurchaseId(admin, purchaseId);
  if (existing) return existing;

  // Fetch offer
  const { data: offer, error: offerErr } = await (admin as AnySupabase)
    .from("affiliate_offers")
    .select("id, seller_id, commission_rate, commission_type, commission_flat_sats, settlement_delay_days")
    .eq("id", offerId)
    .single();

  if (offerErr || !offer) {
    return { ok: false, error: "Offer not found" };
  }

  const commissionSats = calculateCommission(offer, saleAmountSats);
  if (commissionSats <= 0) {
    return { ok: false, error: "Commission amount is zero" };
  }

  const settlementDays = offer.settlement_delay_days || AFFILIATE_DEFAULTS.settlementDelayDays;
  const settlesAt = new Date(Date.now() + settlementDays * 24 * 60 * 60 * 1000).toISOString();

  // Create conversion record
  const { data: conversion, error: convErr } = await (admin as AnySupabase)
    .from("affiliate_conversions")
    .insert({
      offer_id: offerId,
      affiliate_id: affiliateId,
      click_id: clickId || null,
      buyer_id: buyerId || null,
      purchase_id: purchaseId || null,
      sale_amount_sats: saleAmountSats,
      commission_sats: commissionSats,
      status: "pending",
      settles_at: settlesAt,
    })
    .select("id")
    .single();

  if (convErr) {
    if (purchaseId && convErr.code === "23505") {
      const raceWinner = await findConversionByPurchaseId(admin, purchaseId);
      if (raceWinner) return raceWinner;
    }

    console.error("Failed to create conversion:", convErr);
    return { ok: false, error: convErr.message };
  }

  // Increment denormalized metrics on the offer
  try {
    const { data: currentOffer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("total_conversions, total_revenue_sats, total_commissions_sats")
      .eq("id", offerId)
      .single();

    if (currentOffer) {
      await (admin as AnySupabase)
        .from("affiliate_offers")
        .update({
          total_conversions: (currentOffer.total_conversions || 0) + 1,
          total_revenue_sats: (currentOffer.total_revenue_sats || 0) + saleAmountSats,
          total_commissions_sats: (currentOffer.total_commissions_sats || 0) + commissionSats,
          updated_at: new Date().toISOString(),
        })
        .eq("id", offerId);
    }
  } catch {
    console.warn("Failed to update offer metrics, skipping");
  }

  return {
    ok: true,
    conversion_id: conversion.id,
    commission_sats: commissionSats,
    settles_at: settlesAt,
  };
}

/**
 * Settle approved commissions: pay affiliate from seller wallet.
 * Called by a cron or manual trigger.
 */
export async function settleCommissions(
  admin: SupabaseClient,
  options?: { limit?: number }
): Promise<{ settled: number; failed: number; total_sats: number }> {
  const limit = options?.limit || 50;

  // Find commissions ready to settle
  const { data: pending, error } = await (admin as AnySupabase)
    .from("affiliate_conversions")
    .select(`
      id, offer_id, affiliate_id, commission_sats,
      affiliate_offers!inner(seller_id)
    `)
    .eq("status", "pending")
    .lte("settles_at", new Date().toISOString())
    .limit(limit);

  if (error || !pending) {
    console.error("Failed to fetch settleable commissions:", error);
    return { settled: 0, failed: 0, total_sats: 0 };
  }

  let settled = 0;
  let failed = 0;
  let totalSats = 0;

  for (const conv of pending) {
    try {
      const sellerId = conv.affiliate_offers.seller_id;
      const affiliateId = conv.affiliate_id;
      const commissionSats = conv.commission_sats;
      const platformFee = calculatePlatformFee(commissionSats);
      const affiliatePayout = commissionSats - platformFee;

      // Check seller balance
      const { data: sellerWallet } = await (admin as AnySupabase)
        .from("wallets")
        .select("balance_sats")
        .eq("user_id", sellerId)
        .single();

      const sellerBalance = sellerWallet?.balance_sats ?? 0;
      if (sellerBalance < commissionSats) {
        console.warn(`Seller ${sellerId} insufficient balance for commission ${conv.id}`);
        failed++;
        continue;
      }

      // Deduct from seller
      const newSellerBalance = sellerBalance - commissionSats;
      await (admin as AnySupabase)
        .from("wallets")
        .update({ balance_sats: newSellerBalance, updated_at: new Date().toISOString() })
        .eq("user_id", sellerId);

      // Credit affiliate
      const { data: affWallet } = await (admin as AnySupabase)
        .from("wallets")
        .select("balance_sats")
        .eq("user_id", affiliateId)
        .single();

      let newAffBalance: number;
      if (affWallet) {
        newAffBalance = (affWallet.balance_sats ?? 0) + affiliatePayout;
        await (admin as AnySupabase)
          .from("wallets")
          .update({ balance_sats: newAffBalance, updated_at: new Date().toISOString() })
          .eq("user_id", affiliateId);
      } else {
        newAffBalance = affiliatePayout;
        await (admin as AnySupabase)
          .from("wallets")
          .insert({ user_id: affiliateId, balance_sats: newAffBalance });
      }

      // Credit platform fee
      if (platformFee > 0) {
        const { data: platWallet } = await (admin as AnySupabase)
          .from("wallets")
          .select("balance_sats")
          .eq("user_id", PLATFORM_WALLET_USER_ID)
          .single();

        const newPlatBalance = (platWallet?.balance_sats ?? 0) + platformFee;
        if (platWallet) {
          await (admin as AnySupabase)
            .from("wallets")
            .update({ balance_sats: newPlatBalance, updated_at: new Date().toISOString() })
            .eq("user_id", PLATFORM_WALLET_USER_ID);
        } else {
          await (admin as AnySupabase)
            .from("wallets")
            .insert({ user_id: PLATFORM_WALLET_USER_ID, balance_sats: newPlatBalance });
        }

        // Record platform fee transaction
        await (admin as AnySupabase)
          .from("wallet_transactions")
          .insert({
            user_id: PLATFORM_WALLET_USER_ID,
            type: "affiliate_commission_fee",
            amount_sats: platformFee,
            balance_after: newPlatBalance,
            reference_id: conv.id,
            status: "completed",
          });
      }

      // Record wallet transactions
      await (admin as AnySupabase)
        .from("wallet_transactions")
        .insert([
          {
            user_id: sellerId,
            type: "affiliate_commission_out",
            amount_sats: commissionSats,
            balance_after: newSellerBalance,
            reference_id: conv.id,
            status: "completed",
          },
          {
            user_id: affiliateId,
            type: "affiliate_commission_in",
            amount_sats: affiliatePayout,
            balance_after: newAffBalance,
            reference_id: conv.id,
            status: "completed",
          },
        ]);

      // Mark conversion as paid
      await (admin as AnySupabase)
        .from("affiliate_conversions")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conv.id);

      // Notify affiliate
      await (admin as AnySupabase)
        .from("notifications")
        .insert({
          user_id: affiliateId,
          type: "affiliate_commission_paid",
          title: "Commission paid! 💰",
          body: `You earned ${affiliatePayout.toLocaleString()} sats from an affiliate sale`,
          data: { conversion_id: conv.id, amount_sats: affiliatePayout },
        });

      settled++;
      totalSats += affiliatePayout;
    } catch (err) {
      console.error(`Failed to settle commission ${conv.id}:`, err);
      failed++;
    }
  }

  return { settled, failed, total_sats: totalSats };
}

/**
 * Claw back a commission (e.g., on refund).
 */
export async function clawbackCommission(
  admin: SupabaseClient,
  conversionId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: conv, error } = await (admin as AnySupabase)
    .from("affiliate_conversions")
    .select("id, status, commission_sats, affiliate_id, offer_id")
    .eq("id", conversionId)
    .single();

  if (error || !conv) {
    return { ok: false, error: "Conversion not found" };
  }

  if (conv.status === "clawed_back") {
    return { ok: false, error: "Already clawed back" };
  }

  // If already paid, reverse all three legs of the settlement:
  // affiliate payout, platform fee, and seller deduction.
  if (conv.status === "paid") {
    const platformFee = calculatePlatformFee(conv.commission_sats);
    const affiliatePayout = conv.commission_sats - platformFee;

    // 1. Deduct affiliate payout from affiliate wallet (only what they received)
    const { data: affWallet } = await (admin as AnySupabase)
      .from("wallets")
      .select("balance_sats")
      .eq("user_id", conv.affiliate_id)
      .single();

    if (affWallet) {
      const newAffBalance = Math.max(0, (affWallet.balance_sats ?? 0) - affiliatePayout);
      await (admin as AnySupabase)
        .from("wallets")
        .update({ balance_sats: newAffBalance, updated_at: new Date().toISOString() })
        .eq("user_id", conv.affiliate_id);

      await (admin as AnySupabase)
        .from("wallet_transactions")
        .insert({
          user_id: conv.affiliate_id,
          type: "affiliate_commission_clawback",
          amount_sats: affiliatePayout,
          balance_after: newAffBalance,
          reference_id: conversionId,
          status: "completed",
        });
    }

    // 2. Return full commission to seller
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("seller_id")
      .eq("id", conv.offer_id)
      .single();

    if (offer?.seller_id) {
      const { data: sellerWallet } = await (admin as AnySupabase)
        .from("wallets")
        .select("balance_sats")
        .eq("user_id", offer.seller_id)
        .single();

      const newSellerBalance = (sellerWallet?.balance_sats ?? 0) + conv.commission_sats;
      if (sellerWallet) {
        await (admin as AnySupabase)
          .from("wallets")
          .update({ balance_sats: newSellerBalance, updated_at: new Date().toISOString() })
          .eq("user_id", offer.seller_id);
      } else {
        await (admin as AnySupabase)
          .from("wallets")
          .insert({ user_id: offer.seller_id, balance_sats: newSellerBalance });
      }

      await (admin as AnySupabase)
        .from("wallet_transactions")
        .insert({
          user_id: offer.seller_id,
          type: "affiliate_commission_clawback_refund",
          amount_sats: conv.commission_sats,
          balance_after: newSellerBalance,
          reference_id: conversionId,
          status: "completed",
        });
    }

    // 3. Return platform fee from platform wallet
    if (platformFee > 0) {
      const { data: platWallet } = await (admin as AnySupabase)
        .from("wallets")
        .select("balance_sats")
        .eq("user_id", PLATFORM_WALLET_USER_ID)
        .single();

      const newPlatBalance = Math.max(0, (platWallet?.balance_sats ?? 0) - platformFee);
      if (platWallet) {
        await (admin as AnySupabase)
          .from("wallets")
          .update({ balance_sats: newPlatBalance, updated_at: new Date().toISOString() })
          .eq("user_id", PLATFORM_WALLET_USER_ID);

        await (admin as AnySupabase)
          .from("wallet_transactions")
          .insert({
            user_id: PLATFORM_WALLET_USER_ID,
            type: "affiliate_commission_fee_clawback",
            amount_sats: platformFee,
            balance_after: newPlatBalance,
            reference_id: conversionId,
            status: "completed",
          });
      }
    }
  }

  // Update conversion status
  await (admin as AnySupabase)
    .from("affiliate_conversions")
    .update({
      status: "clawed_back",
      clawed_back_at: new Date().toISOString(),
      clawback_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversionId);

  return { ok: true };
}
