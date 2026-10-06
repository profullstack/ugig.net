import { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_FEE_RATES, PLATFORM_WALLET_USER_ID } from "@/lib/constants";
import {
  getUserLnWallet,
  getLnBalance,
  internalTransfer,
  syncBalanceCache,
} from "@/lib/lightning/wallet-utils";
import { isPaidPlan } from "@/lib/plans";

const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

export interface PromptPurchaseResult {
  ok: boolean;
  purchase_id?: string;
  fee_sats?: number;
  fee_rate?: number;
  new_balance?: number;
  error?: string;
}

/**
 * Determine the fee rate for a seller based on their subscription plan.
 * Pro and Lifetime sellers get the reduced rate.
 */
export function getSellerFeeRate(plan: string | null | undefined): number {
  if (isPaidPlan(plan)) return PROMPT_FEE_RATES.pro;
  return PROMPT_FEE_RATES.free;
}

/**
 * Calculate the fee in sats for a prompt purchase.
 */
export function calculatePromptFee(priceSats: number, feeRate: number): number {
  return Math.floor(priceSats * feeRate);
}

/**
 * Execute a prompt purchase using LNbits internal transfers.
 * Runs as service role — caller must authorize.
 */
export async function executePromptPurchase(
  admin: SupabaseClient,
  params: {
    buyerId: string;
    sellerId: string;
    listingId: string;
    priceSats: number;
    sellerPlan: string | null;
  },
): Promise<PromptPurchaseResult> {
  const { buyerId, sellerId, listingId, priceSats, sellerPlan } = params;

  // Free prompts: just create the purchase record, no wallet flow
  if (priceSats === 0) {
    const { data: purchase, error } = await admin
      .from("prompt_purchases" as any)
      .insert({
        listing_id: listingId,
        buyer_id: buyerId,
        seller_id: sellerId,
        price_sats: 0,
        fee_sats: 0,
        fee_rate: 0,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { ok: false, error: "Already purchased" };
      return { ok: false, error: error.message };
    }

    return { ok: true, purchase_id: (purchase as any).id, fee_sats: 0, fee_rate: 0 };
  }

  // Paid prompts: LNbits wallet flow
  const feeRate = getSellerFeeRate(sellerPlan);
  const feeSats = calculatePromptFee(priceSats, feeRate);
  const sellerAmount = priceSats - feeSats;

  // Get buyer's LNbits wallet
  const buyerWallet = await getUserLnWallet(admin, buyerId);
  if (!buyerWallet) {
    return { ok: false, error: "No Lightning wallet found" };
  }

  // Check buyer's real LNbits balance
  const buyerBalance = await getLnBalance(buyerWallet.invoice_key);
  if (buyerBalance < priceSats) {
    return { ok: false, error: "Insufficient balance" };
  }

  // Get seller's LNbits wallet
  const sellerWallet = await getUserLnWallet(admin, sellerId);
  if (!sellerWallet) {
    return { ok: false, error: "Seller has no Lightning wallet" };
  }

  // Transfer seller's share: buyer → seller
  try {
    await internalTransfer(
      buyerWallet.admin_key,
      sellerWallet.invoice_key,
      sellerAmount,
      "ugig.net prompt purchase",
    );
  } catch (err) {
    console.error("[prompt-purchase] Transfer to seller failed:", err);
    return { ok: false, error: "Payment transfer failed" };
  }

  // Transfer platform fee: buyer → platform wallet
  if (feeSats > 0) {
    try {
      await internalTransfer(
        buyerWallet.admin_key,
        LNBITS_INVOICE_KEY,
        feeSats,
        "ugig.net prompt purchase fee",
      );
    } catch (err) {
      console.error("[prompt-purchase] Platform fee transfer failed:", err);
    }
  }

  // Get updated balances from LNbits
  const newBuyerBalance = await getLnBalance(buyerWallet.invoice_key);
  const newSellerBalance = await getLnBalance(sellerWallet.invoice_key);

  // Sync Supabase caches
  await syncBalanceCache(admin, buyerId, newBuyerBalance);
  await syncBalanceCache(admin, sellerId, newSellerBalance);

  // Create purchase record
  const { data: purchase, error: purchaseError } = await admin
    .from("prompt_purchases" as any)
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      price_sats: priceSats,
      fee_sats: feeSats,
      fee_rate: feeRate,
    })
    .select("id")
    .single();

  if (purchaseError) {
    console.error("Prompt purchase insert failed after wallet ops:", purchaseError);
    if (purchaseError.code === "23505") return { ok: false, error: "Already purchased" };
    return { ok: false, error: purchaseError.message };
  }

  const purchaseId = (purchase as any).id;

  // Record wallet transactions for audit trail
  const txns: any[] = [
    {
      user_id: buyerId,
      type: "prompt_purchase",
      amount_sats: priceSats,
      balance_after: newBuyerBalance,
      reference_id: purchaseId,
      status: "completed",
    },
    {
      user_id: sellerId,
      type: "prompt_sale",
      amount_sats: sellerAmount,
      balance_after: newSellerBalance,
      reference_id: purchaseId,
      status: "completed",
    },
  ];
  if (feeSats > 0) {
    txns.push({
      user_id: PLATFORM_WALLET_USER_ID,
      type: "prompt_sale_fee",
      amount_sats: feeSats,
      balance_after: 0,
      reference_id: purchaseId,
      status: "completed",
    });
  }
  await admin.from("wallet_transactions" as any).insert(txns);

  return {
    ok: true,
    purchase_id: purchaseId,
    fee_sats: feeSats,
    fee_rate: feeRate,
    new_balance: newBuyerBalance,
  };
}
