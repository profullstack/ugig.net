"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Copy,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  Crown,
  Heart,
  ArrowLeft,
} from "lucide-react";
import { QRCodeCanvas } from "@/components/funding/QRCode";
import {
  SUPPORTED_CURRENCIES,
  type CoinpayCurrency,
} from "@/lib/coinpay-client";
import { FUNDING_LIFETIME_THRESHOLD_USD, formatUsd } from "@/lib/plans";
import { SKILL_FEE_RATES } from "@/lib/constants";

type TierId = "supporter" | "lifetime" | "custom";

type CryptoPayment = {
  payment_id: string;
  address: string;
  amount_crypto: number;
  currency: string;
  expires_at: string;
};

type Step = "tier" | "currency" | "payment";
type PaymentStatus = "idle" | "pending" | "paid" | "expired" | "error";

const TIERS: Array<{
  id: TierId;
  label: string;
  price: string;
  description: string;
  highlight?: boolean;
  icon: typeof Heart;
}> = [
  {
    id: "supporter",
    label: "Supporter",
    price: "$1",
    description: "Show your support for ugig.net",
    icon: Heart,
  },
  {
    id: "lifetime",
    label: "Lifetime",
    price: formatUsd(FUNDING_LIFETIME_THRESHOLD_USD),
    description: `Includes a Lifetime membership (unlimited gig posts, ${Math.round(SKILL_FEE_RATES.pro * 100)}% marketplace seller fee). Sign in first so it attaches to your account.`,
    highlight: true,
    icon: Crown,
  },
];

function tierAmount(tier: TierId, customAmount: number): number {
  if (tier === "supporter") return 1;
  if (tier === "lifetime") return FUNDING_LIFETIME_THRESHOLD_USD;
  return customAmount;
}

const CURRENCY_ICONS: Record<Exclude<CoinpayCurrency, "card">, string> = {
  usdc_pol: "🟣",
  usdc_sol: "🟢",
  usdc_eth: "🔵",
  usdt: "💵",
  sol: "🟣",
  eth: "💎",
  btc: "₿",
  pol: "🟣",
};

export function FundingClient() {
  const [step, setStep] = useState<Step>("tier");
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null);
  const [customAmount, setCustomAmount] = useState<number>(10);
  const [selectedCurrency, setSelectedCurrency] =
    useState<CoinpayCurrency | null>(null);

  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(
    null
  );

  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    setStep("tier");
    setSelectedTier(null);
    setSelectedCurrency(null);
    setCryptoPayment(null);
    setStatus("idle");
    setError(null);
    setCopiedField(null);
  };

  const handleSelectTier = (tier: TierId) => {
    setSelectedTier(tier);
    setError(null);
    setStep("currency");
  };

  const handleSelectCurrency = async (currency: CoinpayCurrency) => {
    if (!selectedTier) return;
    setSelectedCurrency(currency);
    setError(null);
    setLoading(true);

    const amount = tierAmount(selectedTier, customAmount);

    try {
      const res = await fetch("/api/funding/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amount, currency }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to create payment");
        setLoading(false);
        return;
      }

      // CoinPay hosted checkout, when it returns one; redirect.
      if (data.checkout_url) {
        if (data.payment_id) sessionStorage.setItem("pending_card_payment_id", data.payment_id);
        window.location.href = data.checkout_url;
        return;
      }

      if (data.address) {
        setCryptoPayment({
          payment_id: data.payment_id,
          address: data.address,
          amount_crypto: data.amount_crypto,
          currency: data.currency,
          expires_at: data.expires_at,
        });
        setStep("payment");
        setStatus("pending");
      } else {
        setError("No payment address returned");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = useCallback(async () => {
    if (!cryptoPayment?.payment_id) return;
    try {
      const res = await fetch(
        `/api/funding/status?payment_id=${cryptoPayment.payment_id}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "forwarded" || data.status === "confirmed") {
        setStatus("paid");
      } else if (data.status === "expired") {
        setStatus("expired");
      } else if (data.status === "failed") {
        setStatus("error");
        setError("Payment failed. Please try again.");
      }
    } catch {
      /* ignore */
    }
  }, [cryptoPayment]);

  useEffect(() => {
    if (status !== "pending" || !cryptoPayment) return;
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [status, cryptoPayment, pollStatus]);

  const handleCopy = async (text: string, field = "default") => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (status === "paid") {
    return (
      <div className="border border-green-500/50 rounded-lg p-8 text-center space-y-4 bg-green-500/5">
        <Check className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold text-green-500">Payment Received!</h2>
        <p className="text-muted-foreground">
          Thank you for your contribution.
        </p>
        <Button onClick={handleReset} variant="outline">
          Make Another Contribution
        </Button>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="border border-yellow-500/50 rounded-lg p-8 text-center space-y-4 bg-yellow-500/5">
        <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto" />
        <h2 className="text-2xl font-bold">Payment Expired</h2>
        <p className="text-muted-foreground">
          The payment has expired. Please create a new one.
        </p>
        <Button onClick={handleReset}>Try Again</Button>
      </div>
    );
  }

  if (step === "payment" && status === "pending" && cryptoPayment) {
    const currencyInfo =
      SUPPORTED_CURRENCIES[selectedCurrency as CoinpayCurrency];
    return (
      <div className="space-y-6">
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Pay with {currencyInfo?.name || cryptoPayment.currency}
            </h2>
            <Badge variant="secondary">
              {cryptoPayment.amount_crypto} {currencyInfo?.symbol || ""}
            </Badge>
          </div>

          <div className="flex justify-center py-4">
            <QRCodeCanvas value={cryptoPayment.address} size={256} />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Amount</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-semibold bg-muted p-3 rounded-md">
                  {cryptoPayment.amount_crypto} {currencyInfo?.symbol}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopy(String(cryptoPayment.amount_crypto), "amount")
                  }
                >
                  {copiedField === "amount" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Send to address
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted p-3 rounded-md break-all">
                  {cryptoPayment.address}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(cryptoPayment.address, "address")}
                >
                  {copiedField === "address" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {cryptoPayment.expires_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Expires at{" "}
                {new Date(cryptoPayment.expires_at).toLocaleTimeString()}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Listening for payment confirmation...</span>
          </div>
        </div>

        <Button variant="ghost" onClick={handleReset} className="w-full">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel &amp; go back
        </Button>
      </div>
    );
  }

  if (step === "currency" && selectedTier) {
    const amount = tierAmount(selectedTier, customAmount);
    const tierLabel =
      TIERS.find((t) => t.id === selectedTier)?.label || "Custom Amount";

    return (
      <div className="space-y-6">
        {error && (
          <div className="border border-destructive/50 rounded-lg p-4 text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{tierLabel}</h2>
            <p className="text-muted-foreground">
              ${amount.toFixed(2)} USD — Choose payment method
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Pay with crypto:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              Object.entries(SUPPORTED_CURRENCIES) as [
                CoinpayCurrency,
                (typeof SUPPORTED_CURRENCIES)[CoinpayCurrency],
              ][]
            )
              .filter(([key]) => key !== "card")
              .map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => handleSelectCurrency(key)}
                  disabled={loading}
                  className={`border rounded-lg p-4 text-center space-y-1 transition-colors hover:border-primary hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                    loading && selectedCurrency === key
                      ? "border-primary bg-accent/50"
                      : ""
                  }`}
                >
                  {loading && selectedCurrency === key ? (
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  ) : (
                    <span className="text-2xl block">
                      {CURRENCY_ICONS[key as Exclude<CoinpayCurrency, "card">]}
                    </span>
                  )}
                  <span className="text-sm font-medium block">
                    {info.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground block">
                    {info.name}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="border border-destructive/50 rounded-lg p-4 text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          return (
            <button
              key={tier.id}
              onClick={() => handleSelectTier(tier.id)}
              className={`text-left border rounded-lg p-6 space-y-3 transition-colors hover:border-primary hover:bg-accent/50 ${
                tier.highlight ? "border-primary/50 bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{tier.label}</h3>
              </div>
              <div className="text-2xl font-bold">{tier.price}</div>
              <p className="text-sm text-muted-foreground">{tier.description}</p>
            </button>
          );
        })}

        <div className="text-left border rounded-lg p-6 space-y-3 transition-colors hover:border-primary hover:bg-accent/50">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Custom Amount</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">$</span>
            <Input
              type="number"
              min={1}
              max={10000}
              value={customAmount}
              onChange={(e) =>
                setCustomAmount(Math.max(1, Number(e.target.value)))
              }
              className="text-2xl font-bold h-auto py-0 w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Enter any amount to support development. {formatUsd(FUNDING_LIFETIME_THRESHOLD_USD)}+ includes a Lifetime membership.
          </p>
          <Button
            size="sm"
            onClick={() => handleSelectTier("custom")}
            className="mt-1"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
