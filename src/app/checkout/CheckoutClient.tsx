"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { COINPAY_PLAN_PRICES_USD, PAID_PERKS, formatUsd, type CoinPayPlan } from "@/lib/plans";

export interface CheckoutCoinOption {
  value: string;
  label: string;
}

const PLAN_LABELS: Record<CoinPayPlan, { name: string; suffix: string }> = {
  monthly: { name: "Pro, monthly", suffix: "/month" },
  annual: { name: "Pro, yearly", suffix: "/year" },
  lifetime: { name: "Lifetime", suffix: " once" },
};

export function CheckoutClient({
  initialPlan,
  coins,
  paypal,
  canceled,
  currentPlan,
  paidThrough,
}: {
  initialPlan: CoinPayPlan;
  coins: CheckoutCoinOption[];
  paypal: boolean;
  canceled: boolean;
  currentPlan: "free" | "pro" | "lifetime";
  paidThrough: string | null;
}) {
  const [plan, setPlan] = useState<CoinPayPlan>(initialPlan);
  const [currency, setCurrency] = useState(coins[0]?.value ?? "");
  const [busy, setBusy] = useState<"crypto" | "paypal" | null>(null);
  const [error, setError] = useState<string | null>(
    canceled ? "Checkout was canceled. You can try again anytime." : null
  );

  if (currentPlan === "lifetime") {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-6">
        <p className="font-medium flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" /> You have Lifetime. Nothing to buy.
        </p>
        <Link href="/dashboard" className="text-primary underline text-sm mt-2 inline-block">
          Back to your dashboard
        </Link>
      </div>
    );
  }

  const price = COINPAY_PLAN_PRICES_USD[plan];

  const pay = async (method: "crypto" | "paypal") => {
    setBusy(method);
    setError(null);
    try {
      const res = await fetch("/api/payments/coinpayportal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          method === "paypal"
            ? { type: "subscription", plan, method: "paypal" }
            : { type: "subscription", plan, method: "crypto", currency }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not start checkout");
        return;
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url as string;
        return;
      }
      setError("CoinPay returned no checkout link. Please try again.");
    } catch {
      setError("Could not start checkout");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {currentPlan === "pro" && paidThrough && (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          You have Pro until {new Date(paidThrough).toLocaleDateString()}. Paying now adds the time to that
          date.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-2">Plan</legend>
        {(Object.keys(PLAN_LABELS) as CoinPayPlan[]).map((p) => (
          <label
            key={p}
            className={`flex items-center justify-between rounded-lg border p-4 cursor-pointer ${
              plan === p ? "border-primary ring-2 ring-primary/20" : "border-border"
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="plan"
                value={p}
                checked={plan === p}
                onChange={() => setPlan(p)}
              />
              {PLAN_LABELS[p].name}
            </span>
            <span className="font-semibold">
              {formatUsd(COINPAY_PLAN_PRICES_USD[p])}
              <span className="text-sm font-normal text-muted-foreground">{PLAN_LABELS[p].suffix}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <ul className="text-sm text-muted-foreground list-disc pl-5">
        {PAID_PERKS.map((perk) => (
          <li key={perk}>{plan === "lifetime" ? `${perk}, forever` : perk}</li>
        ))}
        {plan !== "lifetime" && <li>Prepaid: nothing renews automatically</li>}
      </ul>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border p-4">
        <Label htmlFor="checkout-coin">Pay with crypto</Label>
        <select
          id="checkout-coin"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {coins.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Button className="w-full" disabled={busy !== null || !currency} onClick={() => pay("crypto")}>
          {busy === "crypto" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-4 w-4 mr-2" />}
          Pay {formatUsd(price)} with crypto
        </Button>
      </div>

      {paypal && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <Button
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={() => pay("paypal")}
          >
            {busy === "paypal" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Pay {formatUsd(price)} with PayPal or card
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Debit or credit card works without a PayPal account.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Payments are processed by CoinPay. Your plan switches on as soon as CoinPay confirms the payment.
      </p>
    </div>
  );
}
