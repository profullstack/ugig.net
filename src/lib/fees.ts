/**
 * Fee arithmetic shown to users BEFORE they pay (Terms §5). Each helper mirrors
 * the server code that actually charges the fee, so the preview and the charge
 * agree to the sat / cent.
 *
 * Client-safe: no server-only imports.
 */
import { ESCROW_FEE_RATE, PLATFORM_FEE_RATE } from "@/lib/constants";

/** "5%", "2%", "2.5%" */
export function formatFeeRate(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * Zap split, mirroring POST /api/wallet/zap: the sender is debited the full
 * amount; the platform keeps floor(amount * 2%) and the recipient gets the rest.
 */
export function zapFeeSplit(amountSats: number): { feeSats: number; recipientSats: number } {
  const feeSats = Math.floor(amountSats * PLATFORM_FEE_RATE);
  return { feeSats, recipientSats: amountSats - feeSats };
}

/**
 * Marketplace sale split, mirroring src/lib/{skills,mcp,prompts}/purchase.ts:
 * the buyer pays exactly the list price; the fee comes out of the seller's share.
 */
export function sellerFeeSplit(
  priceSats: number,
  feeRate: number
): { feeSats: number; sellerSats: number } {
  const feeSats = Math.floor(priceSats * feeRate);
  return { feeSats, sellerSats: priceSats - feeSats };
}

/**
 * Escrow split, mirroring POST /api/gigs/[id]/escrow and its release route: the
 * poster deposits the escrow amount; on release the platform keeps 5% and the
 * worker receives the rest. USD amounts round the fee to the cent; sats amounts
 * round to the sat.
 */
export function escrowFeeSplit(
  amount: number,
  unit: "USD" | "sats" = "USD"
): { feeAmount: number; workerAmount: number } {
  const feeAmount =
    unit === "sats"
      ? Math.round(amount * ESCROW_FEE_RATE)
      : Math.round(amount * ESCROW_FEE_RATE * 100) / 100;
  const workerAmount =
    unit === "sats" ? amount - feeAmount : Math.round((amount - feeAmount) * 100) / 100;
  return { feeAmount, workerAmount };
}
