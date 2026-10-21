import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import { listCheckoutCoins, paypalCheckoutEnabled } from "@/lib/payments/pro-checkout";
import { checkoutHref, hasPaidAccess, isCoinPayPlan, type CoinPayPlan } from "@/lib/plans";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | ugig.net",
  description: "Upgrade to ugig.net Pro or Lifetime. Pay with crypto, PayPal or card through CoinPay.",
  robots: { index: false, follow: true },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan: CoinPayPlan = isCoinPayPlan(params.plan) ? params.plan : "monthly";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(checkoutHref(plan))}`);

  const [{ data: subscription }, coins] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    listCheckoutCoins(),
  ]);

  const sub = subscription as {
    plan?: string | null;
    status?: string | null;
    current_period_end?: string | null;
  } | null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="max-w-xl mx-auto">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Pricing
          </Link>
          <h1 className="text-2xl font-bold mb-6">Checkout</h1>
          <CheckoutClient
            initialPlan={plan}
            coins={coins}
            paypal={paypalCheckoutEnabled()}
            canceled={params.canceled === "1"}
            currentPlan={sub?.plan === "lifetime" ? "lifetime" : hasPaidAccess(sub) ? "pro" : "free"}
            paidThrough={sub?.plan === "pro" ? (sub.current_period_end ?? null) : null}
          />
        </div>
      </main>
    </div>
  );
}
