import { SupabaseClient } from "@supabase/supabase-js";
import { MCP_FEE_RATES, PLATFORM_WALLET_USER_ID } from "@/lib/constants";
import {
  getUserLnWallet,
  getLnBalance,
  internalTransfer,
  syncBalanceCache,
} from "@/lib/lightning/wallet-utils";

const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || "";

export interface McpPurchaseResult {
  ok: boolean;
  purchase_id?: string;
  fee_sats?: number;
  fee_rate?: number;
  new_balance?: number;
  error?: string;
}

/**
 * Determine the fee rate for a seller based on their subscription plan.
 */
export function getSellerFeeRate(plan: string | null | undefined): number {
  if (plan === "pro") return MCP_FEE_RATES.pro;
  return MCP_FEE_RATES.free;
}

/**
 * Calculate the fee in sats for an MCP purchase.
 */
export function calculateMcpFee(priceSats: number, feeRate: number): number {
  return Math.floor(priceSats * feeRate);
}

/**
 * Execute an MCP server purchase using LNbits internal transfers.
 * Runs as service role — caller must authorize.
 */
export async function executeMcpPurchase(
  admin: SupabaseClient,
  params: {
    buyerId: string;
    sellerId: string;
    listingId: string;
    priceSats: number;
    sellerPlan: string | null;
  },
): Promise<McpPurchaseResult> {
  const { buyerId, sellerId, listingId, priceSats, sellerPlan } = params;

  // Free MCPs: just create the purchase record, no wallet flow
  if (priceSats === 0) {
    const { data: purchase, error } = await admin
      .from("mcp_purchases" as any)
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

  // Paid MCPs: LNbits wallet flow
  const feeRate = getSellerFeeRate(sellerPlan);
  const feeSats = calculateMcpFee(priceSats, feeRate);
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
      "ugig.net MCP server purchase",
    );
  } catch (err) {
    console.error("[mcp-purchase] Transfer to seller failed:", err);
    return { ok: false, error: "Payment transfer failed" };
  }

  // Transfer platform fee: buyer → platform wallet
  if (feeSats > 0) {
    try {
      await internalTransfer(
        buyerWallet.admin_key,
        LNBITS_INVOICE_KEY,
        feeSats,
        "ugig.net MCP server purchase fee",
      );
    } catch (err) {
      console.error("[mcp-purchase] Platform fee transfer failed:", err);
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
    .from("mcp_purchases" as any)
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
    console.error("MCP purchase insert failed after wallet ops:", purchaseError);
    if (purchaseError.code === "23505") return { ok: false, error: "Already purchased" };
    return { ok: false, error: purchaseError.message };
  }

  const purchaseId = (purchase as any).id;

  // Record wallet transactions for audit trail
  const txns: any[] = [
    {
      user_id: buyerId,
      type: "mcp_purchase",
      amount_sats: priceSats,
      balance_after: newBuyerBalance,
      reference_id: purchaseId,
      status: "completed",
    },
    {
      user_id: sellerId,
      type: "mcp_sale",
      amount_sats: sellerAmount,
      balance_after: newSellerBalance,
      reference_id: purchaseId,
      status: "completed",
    },
  ];
  if (feeSats > 0) {
    txns.push({
      user_id: PLATFORM_WALLET_USER_ID,
      type: "mcp_sale_fee",
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
