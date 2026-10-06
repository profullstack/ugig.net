"use client";

import Link from "next/link";
import { Link as LinkIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * What to show when an invoice or payment request came back 409
 * `coinpay_reconnect_required`.
 *
 * The worker gets a button into the existing connect flow; the poster cannot
 * fix somebody else's link, so they get the explanation only (the caller
 * renders "Request a new invoice" next to it where that applies).
 */
export function CoinpayReconnectNotice({
  state,
  canFix,
  connectUrl = "/settings/connections",
}: {
  state: "none" | "needs_reconnect";
  /** True for the worker whose link it is. */
  canFix: boolean;
  connectUrl?: string;
}) {
  const label = state === "none" ? "Connect CoinPay" : "Reconnect CoinPay";
  return (
    <div className="space-y-2" data-testid="coinpay-reconnect-notice">
      <p className="text-xs text-muted-foreground">
        {canFix
          ? state === "none"
            ? "Invoices are paid straight to your CoinPay wallet, so ugig needs a CoinPay connection first."
            : "Your CoinPay connection has expired or lost permission to read your wallet addresses. Reconnecting re-authorises the same account; nothing else changes."
          : "The worker's CoinPay connection has expired or lost the wallet permission, so this cannot be paid until they reconnect."}
      </p>
      {canFix && (
        <Link href={connectUrl} className={buttonVariants({ size: "sm", className: "gap-2" })}>
          <LinkIcon className="h-4 w-4" />
          {label}
        </Link>
      )}
    </div>
  );
}
