"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/components/providers/DialogProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { subscriptions as subscriptionsApi } from "@/lib/api";
import {
  FUNDING_LIFETIME_THRESHOLD_USD,
  PAID_PERKS,
  PLANS,
  PRICE_RAILS_COPY,
  formatUsd,
  hasPaidAccess,
  type CoinPayPlan,
} from "@/lib/plans";
import {
  ArrowLeft,
  Check,
  Crown,
  Loader2,
  CreditCard,
  Calendar,
  AlertCircle,
} from "lucide-react";

type SubscriptionData = {
  plan: "free" | "pro" | "lifetime";
  status: "active" | "canceled" | "past_due" | "trialing" | "incomplete";
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
};

function SubscriptionPageContent() {
  const searchParams = useSearchParams();
  const { confirm } = useDialog();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Check for success/canceled params from Stripe redirect
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");

    if (success) {
      setMessage({
        type: "success",
        text: "Your subscription has been activated! Welcome to Pro.",
      });
    } else if (canceled) {
      setMessage({
        type: "error",
        text: "Checkout was canceled. You can try again anytime.",
      });
    }
  }, [searchParams]);

  // Fetch subscription
  useEffect(() => {
    async function fetchSubscription() {
      const result = await subscriptionsApi.get();
      if (!result.error && result.data) {
        const data = result.data as { data: SubscriptionData };
        setSubscription(data.data);
      }
      setIsLoading(false);
    }

    fetchSubscription();
  }, []);

  const handleUpgrade = async () => {
    setIsProcessing(true);
    setMessage(null);

    try {
      const result = await subscriptionsApi.createCheckout();
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      const data = result.data as { sessionId: string; url: string };

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage({ type: "error", text: "Failed to get checkout URL" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to start checkout" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManageBilling = async () => {
    setIsProcessing(true);

    try {
      const result = await subscriptionsApi.createPortalSession();
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      const data = result.data as { url: string };
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setMessage({ type: "error", text: "Failed to open billing portal" });
    } finally {
      setIsProcessing(false);
    }
  };

  // Crypto checkout through CoinPay: monthly, annual (crypto only) and lifetime (crypto only).
  const handleCryptoCheckout = async (plan: CoinPayPlan) => {
    setIsProcessing(true);
    setMessage(null);
    const failure = `Failed to start ${plan} checkout`;

    try {
      const res = await fetch("/api/payments/coinpayportal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subscription",
          plan,
          currency: "usdc_pol",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || failure });
        return;
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url as string;
      } else {
        setMessage({ type: "error", text: "Failed to get checkout URL" });
      }
    } catch {
      setMessage({ type: "error", text: failure });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (
      !await confirm(
        "Are you sure you want to cancel your subscription? You will keep Pro features until the end of your billing period."
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      const result = await subscriptionsApi.cancel();
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      setSubscription((prev) =>
        prev ? { ...prev, cancel_at_period_end: true } : null
      );
      setMessage({
        type: "success",
        text: "Your subscription will be canceled at the end of the billing period.",
      });
    } catch {
      setMessage({ type: "error", text: "Failed to cancel subscription" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReactivate = async () => {
    setIsProcessing(true);

    try {
      const result = await subscriptionsApi.reactivate();
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      setSubscription((prev) =>
        prev ? { ...prev, cancel_at_period_end: false } : null
      );
      setMessage({ type: "success", text: "Your subscription has been reactivated." });
    } catch {
      setMessage({ type: "error", text: "Failed to reactivate subscription" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const isPro = hasPaidAccess(subscription);
  const isLifetime = subscription?.plan === "lifetime" && subscription?.status === "active";
  const isCanceling = subscription?.cancel_at_period_end;
  // Card Pro is a Stripe subscription (cancel / manage in Stripe). Crypto Pro is
  // prepaid through CoinPay: nothing renews it, so it is extended by paying again.
  const isStripeManaged = Boolean(subscription?.stripe_subscription_id);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Subscription</h1>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === "success"
              ? "bg-green-500/10 text-green-600 border border-green-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {message.type === "success" ? (
            <Check className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          {message.text}
        </div>
      )}

      {/* Current Plan Banner */}
      {isPro && (
        <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium">
                {isLifetime ? "You\u2019re on the Lifetime plan" : "You\u2019re on the Pro plan"}
              </p>
              {!isLifetime && subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  {isStripeManaged ? (isCanceling ? "Cancels" : "Renews") : "Paid through"}{" "}
                  {isStripeManaged ? "on " : ""}
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          {isLifetime ? null : !isStripeManaged ? (
            <Button
              variant="outline"
              onClick={() => handleCryptoCheckout("annual")}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Add a year with crypto (${formatUsd(PLANS.pro.annualUsd)})`
              )}
            </Button>
          ) : isCanceling ? (
            <Button
              variant="outline"
              onClick={handleReactivate}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Reactivate"
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={handleManageBilling}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Manage Billing"
              )}
            </Button>
          )}
        </div>
      )}

      {/* Plans */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Free Plan */}
        <div
          className={`p-6 rounded-lg border ${
            !isPro ? "border-primary ring-2 ring-primary/20" : "border-border"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{PLANS.free.name}</h2>
            {!isPro && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Current
              </span>
            )}
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold">{formatUsd(PLANS.free.priceUsd)}</span>
            <span className="text-muted-foreground">/month</span>
          </div>
          <PerkItems perks={PLANS.free.perks} />
          {isPro && !isLifetime && isStripeManaged && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCancel}
              disabled={isProcessing || isCanceling}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isCanceling ? (
                "Cancellation Pending"
              ) : (
                "Downgrade to Free"
              )}
            </Button>
          )}
        </div>

        {/* Pro Plan */}
        <div
          className={`p-6 rounded-lg border ${
            subscription?.plan === "pro" ? "border-primary ring-2 ring-primary/20" : "border-border"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{PLANS.pro.name}</h2>
              <Crown className="h-5 w-5 text-primary" />
            </div>
            {subscription?.plan === "pro" && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Current
              </span>
            )}
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold">{formatUsd(PLANS.pro.monthlyUsd)}</span>
            <span className="text-muted-foreground">/month</span>
            <p className="text-sm text-muted-foreground mt-1">
              or {formatUsd(PLANS.pro.annualUsd)}/year ({PRICE_RAILS_COPY.annual})
            </p>
          </div>
          <PerkItems perks={["Everything in Free", ...PLANS.pro.perks]} />
          {!isPro && (
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleUpgrade}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    {formatUsd(PLANS.pro.monthlyUsd)}/month by card
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleCryptoCheckout("monthly")}
                disabled={isProcessing}
              >
                Pay {formatUsd(PLANS.pro.monthlyUsd)}/month with crypto (CoinPay)
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleCryptoCheckout("annual")}
                disabled={isProcessing}
              >
                Pay {formatUsd(PLANS.pro.annualUsd)}/year with crypto (CoinPay)
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Annual billing is crypto only.
              </p>
            </div>
          )}
          {subscription?.plan === "pro" && isStripeManaged && !isCanceling && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleManageBilling}
              disabled={isProcessing}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Manage Billing
            </Button>
          )}
        </div>

        {/* Lifetime Plan */}
        <div
          className={`p-6 rounded-lg border ${
            isLifetime ? "border-primary ring-2 ring-primary/20" : "border-border"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Lifetime</h2>
              <Crown className="h-5 w-5 text-primary" />
            </div>
            {isLifetime && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Current
              </span>
            )}
          </div>
          <div className="mb-4">
            <span className="text-3xl font-bold">{formatUsd(PLANS.lifetime.oneTimeUsd)}</span>
            <span className="text-muted-foreground"> one-time</span>
            <p className="text-sm text-muted-foreground mt-1">
              {PRICE_RAILS_COPY.lifetime.charAt(0).toUpperCase() + PRICE_RAILS_COPY.lifetime.slice(1)}
            </p>
          </div>
          <PerkItems perks={[...PAID_PERKS.map((perk) => `${perk}, forever`), "Never renews"]} />
          <p className="text-sm text-green-600 dark:text-green-400 font-semibold mb-4">
            Fund ugig.net {formatUsd(FUNDING_LIFETIME_THRESHOLD_USD)}+ and lifetime is included free
          </p>
          {!isLifetime && (
            <Button
              className="w-full"
              onClick={() => handleCryptoCheckout("lifetime")}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 mr-2" />
                  Buy Lifetime ({formatUsd(PLANS.lifetime.oneTimeUsd)}, crypto)
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PerkItems({ perks }: { perks: readonly string[] }) {
  return (
    <ul className="space-y-3 mb-6">
      {perks.map((perk) => (
        <li key={perk} className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-green-500" />
          {perk}
        </li>
      ))}
    </ul>
  );
}

function SubscriptionPageLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<SubscriptionPageLoading />}>
      <SubscriptionPageContent />
    </Suspense>
  );
}
