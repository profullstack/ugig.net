"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OwnerBuyInfo {
  owner?: boolean;
  seller_ready?: boolean;
  fee_percent?: number;
  reason?: string;
  fix?: "not_connected" | "needs_reconnect" | "no_wallets";
}

/**
 * On a seller's own fixed-price for-hire listing: whether buyers can use
 * Buy now on it, and the one thing to do if they can't.
 */
export function BuyNowSellerNotice({ gigId }: { gigId: string }) {
  const [info, setInfo] = useState<OwnerBuyInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gigs/${gigId}/buy`)
      .then((r) => r.json())
      .then((data: OwnerBuyInfo) => !cancelled && setInfo(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gigId]);

  if (!info?.owner) return null;

  if (info.seller_ready) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
        <span>
          Buy now is on. Buyers can pay this listing&apos;s price into escrow; you get it when they release, minus
          ugig&apos;s {info.fee_percent}% fee. <Link href="/dashboard/orders" className="underline">Orders</Link>
        </span>
      </p>
    );
  }

  if (!info.fix) {
    return info.reason ? <p className="text-xs text-muted-foreground">Buy now: {info.reason}</p> : null;
  }

  // `reason` spells out the API call for agents; people get a sentence and buttons.
  const sentence =
    info.fix === "needs_reconnect"
      ? "Buy now is off: your CoinPay link can't read your wallet addresses. Reconnect it, or add a payout wallet to your profile."
      : info.fix === "no_wallets"
        ? "Buy now is off: add a USDC, SOL, POL, ETH, BTC or BCH payout wallet (escrow can't hold USDT on Polygon or Solana)."
        : "Add a payout wallet to your profile, or connect CoinPay, so buyers can pay for this listing with Buy now.";

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <p className="flex items-start gap-2">
        <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
        <span>{sentence}</span>
      </p>
      <div className="flex gap-2">
        <Link href="/profile" className="flex-1">
          <Button size="sm" className="w-full">Add payout wallet</Button>
        </Link>
        <Link href="/settings/connections" className="flex-1">
          <Button size="sm" variant="outline" className="w-full">
            {info.fix === "needs_reconnect" ? "Reconnect CoinPay" : "Connect CoinPay"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
