"use client";

import { formatFeeRate, sellerFeeSplit } from "@/lib/fees";

/**
 * Shown to a seller next to the price field of a marketplace listing form, so
 * the fee is disclosed before anything is sold (Terms §5). Mirrors
 * src/lib/{skills,mcp,prompts}/purchase.ts: the fee comes out of the seller's
 * share; Pro and Lifetime sellers pay the lower rate.
 */
export function SellerFeeNotice({
  priceSats,
  rates,
}: {
  priceSats: number;
  rates: { free: number; pro: number };
}) {
  if (!priceSats || priceSats <= 0) {
    return <p className="text-xs text-muted-foreground">0 for free listing (no fee)</p>;
  }
  const free = sellerFeeSplit(priceSats, rates.free);
  const paid = sellerFeeSplit(priceSats, rates.pro);
  return (
    <p className="text-xs text-muted-foreground" data-testid="seller-fee-notice">
      ugig keeps {formatFeeRate(rates.free)} ({formatFeeRate(rates.pro)} on Pro or Lifetime). You
      receive {free.sellerSats.toLocaleString()} sats ({paid.sellerSats.toLocaleString()} on Pro or
      Lifetime) per sale.
    </p>
  );
}

/** Shown to a buyer under a marketplace buy button: the price is all they pay. */
export function BuyerPriceNote({ priceSats }: { priceSats: number }) {
  if (!priceSats || priceSats <= 0) return null;
  return (
    <p className="text-xs text-muted-foreground mt-2 text-center" data-testid="buyer-price-note">
      You pay exactly {priceSats.toLocaleString()} sats from your ugig wallet. No buyer fee.
    </p>
  );
}
