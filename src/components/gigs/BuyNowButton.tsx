"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QRCodeCanvas } from "@/components/funding/QRCode";

interface BuyInfo {
  buyable: boolean;
  reason?: string;
  amount_usd?: number;
  fee_percent?: number;
  escrow_days?: number;
  currencies?: { value: string; label: string }[];
  paypal?: boolean;
}

interface CreatedOrder {
  id: string;
  amount_usd: number;
  currency: string;
  amount_crypto: number | null;
  escrow_address: string;
  expires_at: string | null;
}

interface BuyNowButtonProps {
  gigId: string;
  loggedIn: boolean;
}

/**
 * "Buy now" for a fixed-price for-hire listing. The buyer pays the price into a
 * CoinPay escrow; the seller is paid when the buyer releases it.
 */
export function BuyNowButton({ gigId, loggedIn }: BuyNowButtonProps) {
  const [info, setInfo] = useState<BuyInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [method, setMethod] = useState<"crypto" | "paypal">("crypto");
  const [refundAddress, setRefundAddress] = useState("");
  const [requirements, setRequirements] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<CreatedOrder | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gigs/${gigId}/buy`)
      .then((r) => r.json())
      .then((data: BuyInfo) => {
        if (cancelled) return;
        setInfo(data);
        if (data.currencies?.length) setCurrency(data.currencies[0].value);
      })
      .catch(() => !cancelled && setInfo({ buyable: false }));
    return () => {
      cancelled = true;
    };
  }, [gigId]);

  if (!info?.buyable) return null;

  const price = `$${Number(info.amount_usd).toFixed(2)}`;

  if (!loggedIn) {
    return (
      <Link href={`/login?redirect=/gigs/${gigId}`} className="block">
        <Button className="w-full" variant="secondary">
          <ShoppingCart className="h-4 w-4 mr-2" />
          Log in to buy now — {price}
        </Button>
      </Link>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setExistingOrderId(null);
    try {
      const res = await fetch(`/api/gigs/${gigId}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          method === "paypal"
            ? { method: "paypal", requirements: requirements || undefined }
            : { currency, refund_address: refundAddress, requirements: requirements || undefined }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start the order");
        if (data.order_id) setExistingOrderId(data.order_id);
        return;
      }
      if (data.approve_url) {
        window.location.href = data.approve_url;
        return;
      }
      setOrder(data.order);
    } catch {
      setError("Could not start the order");
    } finally {
      setSubmitting(false);
    }
  };

  if (order) {
    const coin = info.currencies?.find((c) => c.value === order.currency)?.label ?? order.currency.toUpperCase();
    return (
      <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
        <p className="font-medium">Send payment to escrow</p>
        <p className="text-muted-foreground">
          Send {order.amount_crypto != null ? <strong>{order.amount_crypto}</strong> : "the amount"} {coin} (
          {price}) to:
        </p>
        <div className="flex justify-center bg-white p-2 rounded">
          <QRCodeCanvas value={order.escrow_address} size={180} />
        </div>
        <code className="block break-all rounded bg-muted p-2 text-xs">{order.escrow_address}</code>
        <p className="text-muted-foreground">
          The seller is notified when it arrives. You release the payment from{" "}
          <Link href="/orders" className="underline">Orders</Link> once the work is delivered.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <Button className="w-full" variant="secondary" onClick={() => setOpen(true)}>
        <ShoppingCart className="h-4 w-4 mr-2" />
        Buy now — {price}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-green-500" />
        Buy now — {price}, held in escrow
      </p>
      <p className="text-xs text-muted-foreground">
        Your payment is held until you release it to the seller. If you do nothing it
        releases to the seller after {info.escrow_days} days unless you open a dispute. The seller receives the
        price minus ugig&apos;s {info.fee_percent}% fee.
      </p>

      {info.paypal && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={method === "crypto" ? "default" : "outline"} onClick={() => setMethod("crypto")}>
            Crypto
          </Button>
          <Button type="button" size="sm" variant={method === "paypal" ? "default" : "outline"} onClick={() => setMethod("paypal")}>
            PayPal
          </Button>
        </div>
      )}

      {method === "paypal" ? (
        <p className="text-xs text-muted-foreground">
          You&apos;ll approve the payment on PayPal. ugig holds it and pays the seller when you release it.
        </p>
      ) : (
      <>
      <div className="space-y-1">
        <Label htmlFor="buy-currency">Pay with</Label>
        <select
          id="buy-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {info.currencies?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="buy-refund">Your wallet address (for a refund)</Label>
        <Input
          id="buy-refund"
          value={refundAddress}
          onChange={(e) => setRefundAddress(e.target.value)}
          placeholder="Where a refund should go"
        />
      </div>
      </>
      )}

      <div className="space-y-1">
        <Label htmlFor="buy-reqs">What you need (optional)</Label>
        <Textarea
          id="buy-reqs"
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          rows={3}
          placeholder="Details for the seller"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error}
          {existingOrderId && (
            <>
              {" "}
              <Link href="/orders" className="underline">View it in Orders</Link>
            </>
          )}
        </p>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={submitting || (method === "crypto" && (!currency || refundAddress.trim().length < 10))}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : method === "paypal" ? `Continue to PayPal (${price})` : `Pay ${price}`}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
