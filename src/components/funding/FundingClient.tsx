"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Zap,
  Copy,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  Crown,
  CreditCard,
  Heart,
  ArrowLeft,
  LogIn,
} from "lucide-react";
import { QRCodeCanvas } from "@/components/funding/QRCode";
import { SUPPORTED_CURRENCIES } from "@/lib/coinpayportal";
import type { SupportedCurrency } from "@/lib/coinpayportal";

// ─── Types ─────────────────────────────────────────────────────────────────

type TierId = "supporter" | "lifetime" | "custom";

type LightningInvoice = {
  paymentRequest: string;
  paymentHash: string;
  expiresAt: string;
  tier: TierId;
  amountSats: number;
};

type CryptoPayment = {
  payment_id: string;
  address: string;
  amount_crypto: number;
  currency: string;
  expires_at: string;
  checkout_url?: string;
};

type Step = "tier" | "currency" | "payment";
type PaymentStatus = "idle" | "pending" | "paid" | "expired" | "error";

// ─── Tier config ───────────────────────────────────────────────────────────

const TIERS: Array<{
  id: TierId;
  label: string;
  price: string;
  description: string;
  highlight?: boolean;
  icon: typeof Zap;
}> = [
  {
    id: "supporter",
    label: "Supporter",
    price: "$1",
    description: "Supporter badge on your profile",
    icon: Heart,
  },
  {
    id: "lifetime",
    label: "Lifetime Premium",
    price: "$50",
    description:
      "All premium features forever, Founder badge, unlimited job postings, API access",
    highlight: true,
    icon: Crown,
  },
];

function tierAmount(tier: TierId, customAmount: number): number {
  if (tier === "supporter") return 1;
  if (tier === "lifetime") return 50;
  return customAmount;
}

// ─── Currency icons (simple text-based) ────────────────────────────────────

const CURRENCY_ICONS: Record<SupportedCurrency, string> = {
  usdc_pol: "🟣",
  usdc_sol: "🟢",
  usdc_eth: "🔵",
  usdt: "💵",
  sol: "🟣",
  eth: "💎",
  btc: "₿",
  pol: "🟣",
};

// ─── Component ─────────────────────────────────────────────────────────────

export function FundingClient() {
  const [step, setStep] = useState<Step>("tier");
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null);
  const [customAmount, setCustomAmount] = useState<number>(10);
  const [selectedCurrency, setSelectedCurrency] =
    useState<SupportedCurrency | null>(null);

  // Lightning state
  const [lnInvoice, setLnInvoice] = useState<LightningInvoice | null>(null);
  // Crypto state
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(
    null
  );

  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep("tier");
    setSelectedTier(null);
    setSelectedCurrency(null);
    setLnInvoice(null);
    setCryptoPayment(null);
    setStatus("idle");
    setError(null);
    setNeedsLogin(false);
    setCopiedField(null);
  };

  const handleSelectTier = (tier: TierId) => {
    setSelectedTier(tier);
    setError(null);
    setNeedsLogin(false);
    setStep("currency");
  };

  const handleSelectCurrency = async (currency: SupportedCurrency) => {
    if (!selectedTier) return;
    setSelectedCurrency(currency);
    setError(null);
    setNeedsLogin(false);
    setLoading(true);

    const amount = tierAmount(selectedTier, customAmount);

    try {
      const res = await fetch("/api/payments/coinpayportal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tip",
          amount_usd: amount,
          currency,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setNeedsLogin(true);
        } else {
          setError(data.error || "Failed to create payment");
        }
        setLoading(false);
        return;
      }

      // If checkout_url exists, redirect to hosted checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      // Otherwise show address inline
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

  const handleCard = async () => {
    if (!selectedTier) return;
    setError(null);
    setNeedsLogin(false);
    setLoading(true);

    const amount = tierAmount(selectedTier, customAmount);

    try {
      const res = await fetch("/api/funding/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amount }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setNeedsLogin(true);
        } else {
          setError(data.error || "Failed to create checkout");
        }
        setLoading(false);
        return;
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError("No checkout URL returned");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLightning = async () => {
    if (!selectedTier) return;
    setError(null);
    setNeedsLogin(false);
    setLoading(true);

    const tier = selectedTier;

    try {
      const res = await fetch("/api/funding/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          amount_usd: tierAmount(tier, customAmount),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setNeedsLogin(true);
        } else {
          setError(data.error || "Failed to create invoice");
        }
        setLoading(false);
        return;
      }

      setLnInvoice(data);
      setStep("payment");
      setStatus("pending");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Lightning poll ────────────────────────────────────────────────────

  const pollLnStatus = useCallback(async () => {
    if (!lnInvoice) return;
    try {
      const res = await fetch(
        `/api/funding/status?paymentHash=${lnInvoice.paymentHash}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "paid") {
        setStatus("paid");
      } else if (
        data.status === "expired" ||
        new Date(lnInvoice.expiresAt) < new Date()
      ) {
        setStatus("expired");
      }
    } catch {
      // ignore poll errors
    }
  }, [lnInvoice]);

  useEffect(() => {
    if (status !== "pending" || !lnInvoice) return;
    const interval = setInterval(pollLnStatus, 3000);
    return () => clearInterval(interval);
  }, [status, lnInvoice, pollLnStatus]);

  // ─── Crypto payment poll ───────────────────────────────────────────────

  const pollCryptoStatus = useCallback(async () => {
    if (!cryptoPayment?.payment_id) return;
    try {
      const res = await fetch(
        `/api/payments/coinpayportal/status?payment_id=${cryptoPayment.payment_id}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "forwarded") {
        // Funds fully forwarded to merchant — payment complete
        setStatus("paid");
      } else if (data.status === "confirmed" || data.status === "forwarding") {
        // Payment received on-chain, waiting for forwarding to merchant
        // Don't mark as paid yet — keep polling
      } else if (data.status === "expired") {
        setStatus("expired");
      } else if (data.status === "failed") {
        setStatus("error");
        setError("Payment failed. Please try again.");
      } else if (data.status === "forwarding_failed") {
        setStatus("error");
        setError("Payment was received but processing failed. Please contact support.");
      }
    } catch {
      // ignore poll errors
    }
  }, [cryptoPayment]);

  useEffect(() => {
    if (status !== "pending" || !cryptoPayment) return;
    const interval = setInterval(pollCryptoStatus, 5000);
    return () => clearInterval(interval);
  }, [status, cryptoPayment, pollCryptoStatus]);

  // ─── Copy helper ──────────────────────────────────────────────────────

  const handleCopy = async (text: string, field: string = "default") => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ─── Render: Paid ─────────────────────────────────────────────────────

  if (status === "paid") {
    return (
      <div className="border border-green-500/50 rounded-lg p-8 text-center space-y-4 bg-green-500/5">
        <Check className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold text-green-500">
          Payment Received!
        </h2>
        <p className="text-muted-foreground">
          Your contribution has been processed. Rewards have been applied to
          your account.
        </p>
        <Button onClick={handleReset} variant="outline">
          Make Another Contribution
        </Button>
      </div>
    );
  }

  // ─── Render: Expired ──────────────────────────────────────────────────

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

  // ─── Render: Payment (Lightning invoice or crypto address) ────────────

  if (step === "payment" && status === "pending") {
    // Lightning invoice
    if (lnInvoice) {
      return (
        <div className="space-y-6">
          <div className="border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Pay with Lightning ⚡</h2>
              <Badge variant="secondary">
                {lnInvoice.amountSats.toLocaleString()} sats
              </Badge>
            </div>

            <div className="flex justify-center py-4">
              <QRCodeCanvas value={lnInvoice.paymentRequest} size={256} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted p-3 rounded-md break-all max-h-20 overflow-auto">
                  {lnInvoice.paymentRequest}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(lnInvoice.paymentRequest, "ln-invoice")}
                >
                  {copiedField === "ln-invoice" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Invoice expires at{" "}
                {new Date(lnInvoice.expiresAt).toLocaleTimeString()}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Waiting for payment confirmation...</span>
            </div>
          </div>

          <Button variant="ghost" onClick={handleReset} className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancel &amp; go back
          </Button>
        </div>
      );
    }

    // Crypto address (inline)
    if (cryptoPayment) {
      const currencyInfo =
        SUPPORTED_CURRENCIES[selectedCurrency as SupportedCurrency];
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
                    onClick={() => handleCopy(String(cryptoPayment.amount_crypto), "crypto-amount")}
                  >
                    {copiedField === "crypto-amount" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Send to address</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted p-3 rounded-md break-all">
                    {cryptoPayment.address}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(cryptoPayment.address, "crypto-address")}
                  >
                    {copiedField === "crypto-address" ? (
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
  }

  // ─── Render: Currency Selection ───────────────────────────────────────

  if (step === "currency" && selectedTier) {
    const amount = tierAmount(selectedTier, customAmount);
    const tierLabel =
      TIERS.find((t) => t.id === selectedTier)?.label || "Custom Amount";

    return (
      <div className="space-y-6">
        {/* Login required */}
        {needsLogin && (
          <div className="border border-yellow-500/50 rounded-lg p-4 bg-yellow-500/5 flex items-center gap-3">
            <LogIn className="h-5 w-5 text-yellow-500 shrink-0" />
            <div>
              <p className="font-medium">Login required</p>
              <p className="text-sm text-muted-foreground">
                Please{" "}
                <Link href="/login" className="underline text-primary">
                  log in
                </Link>{" "}
                to make a contribution.
              </p>
            </div>
          </div>
        )}

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

        {/* Lightning button */}
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-14 text-base"
          onClick={handleLightning}
          disabled={loading}
        >
          {loading && !selectedCurrency ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Zap className="h-5 w-5 text-yellow-500" />
          )}
          Pay with Lightning ⚡
        </Button>

        {/* Credit card button */}
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-14 text-base"
          onClick={handleCard}
          disabled={loading}
        >
          {loading && !selectedCurrency ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CreditCard className="h-5 w-5 text-blue-500" />
          )}
          Pay with Card 💳
        </Button>

        {/* Crypto currencies grid */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Or pay with crypto:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              Object.entries(SUPPORTED_CURRENCIES) as [
                SupportedCurrency,
                (typeof SUPPORTED_CURRENCIES)[SupportedCurrency],
              ][]
            ).map(([key, info]) => (
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
                    {CURRENCY_ICONS[key]}
                  </span>
                )}
                <span className="text-sm font-medium block">{info.symbol}</span>
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

  // ─── Render: Tier Selection (default) ─────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Login required */}
      {needsLogin && (
        <div className="border border-yellow-500/50 rounded-lg p-4 bg-yellow-500/5 flex items-center gap-3">
          <LogIn className="h-5 w-5 text-yellow-500 shrink-0" />
          <div>
            <p className="font-medium">Login required</p>
            <p className="text-sm text-muted-foreground">
              Please{" "}
              <Link href="/login" className="underline text-primary">
                log in
              </Link>{" "}
              to make a contribution.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-destructive/50 rounded-lg p-4 text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tier cards */}
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
              <p className="text-sm text-muted-foreground">
                {tier.description}
              </p>
            </button>
          );
        })}

        {/* Custom amount card */}
        <div className="text-left border rounded-lg p-6 space-y-3 transition-colors hover:border-primary hover:bg-accent/50">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
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
            Enter any amount to support development
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
