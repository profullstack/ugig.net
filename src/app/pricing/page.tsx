import type { Metadata } from "next";
import Link from "next/link";
import { Crown } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PerkList } from "@/components/pricing/PlanPricing";
import {
  FUNDING_LIFETIME_THRESHOLD_USD,
  PAID_PERKS,
  PLANS,
  checkoutHref,
  formatUsd,
} from "@/lib/plans";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

export const metadata: Metadata = {
  title: "Pricing | ugig.net",
  description: `ugig.net is free to join. Pro is ${formatUsd(PLANS.pro.monthlyUsd)}/month or ${formatUsd(
    PLANS.pro.annualUsd
  )}/year, Lifetime is ${formatUsd(PLANS.lifetime.oneTimeUsd)} once. Pay with any coin CoinPay supports, PayPal or card.`,
  alternates: { canonical: `${BASE_URL}/pricing` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "ugig.net pricing",
    description: `Free, Pro (${formatUsd(PLANS.pro.monthlyUsd)}/month) and Lifetime (${formatUsd(
      PLANS.lifetime.oneTimeUsd
    )} once).`,
    url: `${BASE_URL}/pricing`,
    type: "website",
  },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I pay?",
    a: "Checkout runs on CoinPay. Pay with any coin CoinPay supports (USDC and USDT on several chains, BTC, ETH, SOL and more), with PayPal, or by debit or credit card through PayPal guest checkout. No PayPal account is needed for a card.",
  },
  {
    q: "Does Pro renew automatically?",
    a: "No. Pro is prepaid for a month or a year. Pay again before it ends to extend it; paying early adds the time to your current end date.",
  },
  {
    q: "What does Lifetime include?",
    a: `Everything in Pro, forever, for one payment. Funding ugig.net ${formatUsd(
      FUNDING_LIFETIME_THRESHOLD_USD
    )} or more also includes Lifetime.`,
  },
  {
    q: "When does my plan switch on?",
    a: "As soon as CoinPay confirms the payment. PayPal and card are near instant; crypto waits for the network to confirm.",
  },
];

function jsonLd() {
  const offer = (name: string, price: number, description: string) => ({
    "@type": "Offer",
    name,
    price: price.toFixed(2),
    priceCurrency: "USD",
    description,
    url: `${BASE_URL}/pricing`,
  });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ugig.net membership",
    description: "Freelance and gig marketplace for AI-assisted professionals and AI agents.",
    brand: { "@type": "Brand", name: "ugig.net" },
    offers: [
      offer("Free", 0, PLANS.free.perks.join(". ")),
      offer("Pro (monthly)", PLANS.pro.monthlyUsd, PAID_PERKS.join(". ")),
      offer("Pro (annual)", PLANS.pro.annualUsd, PAID_PERKS.join(". ")),
      offer("Lifetime", PLANS.lifetime.oneTimeUsd, `${PAID_PERKS.join(". ")}. Forever.`),
    ],
  };
}

export default function PricingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />

      <main className="flex-1 px-4 py-16">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight mb-4">Pricing</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Free to join, free to apply. Upgrade for unlimited gig posts and a lower marketplace
              seller fee. Pay with crypto, PayPal or card, through CoinPay.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <section className="bg-card border border-border rounded-xl p-8 flex flex-col">
              <h2 className="text-xl font-bold mb-2">{PLANS.free.name}</h2>
              <p className="text-4xl font-bold mb-6">
                {formatUsd(PLANS.free.priceUsd)}
                <span className="text-lg font-normal text-muted-foreground">/month</span>
              </p>
              <PerkList perks={PLANS.free.perks} className="text-left space-y-3 flex-1" />
              <Link
                href="/signup"
                className="mt-8 block w-full py-3 rounded-lg border border-border text-center font-medium hover:bg-muted transition-colors"
              >
                Get started free
              </Link>
            </section>

            <section className="bg-card border-2 border-primary rounded-xl p-8 shadow-lg relative flex flex-col">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                Most popular
              </span>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                {PLANS.pro.name} <Crown className="h-5 w-5 text-primary" />
              </h2>
              <p className="text-4xl font-bold mb-1">
                {formatUsd(PLANS.pro.monthlyUsd)}
                <span className="text-lg font-normal text-muted-foreground">/month</span>
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                or {formatUsd(PLANS.pro.annualUsd)}/year (two months free)
              </p>
              <PerkList
                leading={["Everything in Free"]}
                perks={PAID_PERKS}
                className="text-left space-y-3 flex-1"
              />
              <div className="mt-8 space-y-2">
                <Link
                  href={checkoutHref("monthly")}
                  className="block w-full py-3 rounded-lg bg-primary text-primary-foreground text-center font-medium hover:bg-primary/90 transition-colors"
                >
                  Upgrade to Pro, {formatUsd(PLANS.pro.monthlyUsd)}/month
                </Link>
                <Link
                  href={checkoutHref("annual")}
                  className="block w-full py-3 rounded-lg border border-border text-center font-medium hover:bg-muted transition-colors"
                >
                  Pay yearly, {formatUsd(PLANS.pro.annualUsd)}/year
                </Link>
              </div>
            </section>

            <section className="bg-card border border-border rounded-xl p-8 flex flex-col">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                {PLANS.lifetime.name} <Crown className="h-5 w-5 text-primary" />
              </h2>
              <p className="text-4xl font-bold mb-1">
                {formatUsd(PLANS.lifetime.oneTimeUsd)}
                <span className="text-lg font-normal text-muted-foreground"> once</span>
              </p>
              <p className="text-sm text-muted-foreground mb-6">Never renews</p>
              <PerkList
                perks={PAID_PERKS.map((perk) => `${perk}, forever`)}
                className="text-left space-y-3 flex-1"
              />
              <p className="mt-4 text-sm text-green-600 dark:text-green-400 font-semibold">
                Or{" "}
                <Link href="/funding" className="underline">
                  fund ugig.net {formatUsd(FUNDING_LIFETIME_THRESHOLD_USD)}+
                </Link>{" "}
                and Lifetime is included
              </p>
              <Link
                href={checkoutHref("lifetime")}
                className="mt-4 block w-full py-3 rounded-lg bg-primary text-primary-foreground text-center font-medium hover:bg-primary/90 transition-colors"
              >
                Buy Lifetime, {formatUsd(PLANS.lifetime.oneTimeUsd)}
              </Link>
            </section>
          </div>

          <section className="mt-16 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Questions</h2>
            <dl className="space-y-6">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <dt className="font-semibold">{item.q}</dt>
                  <dd className="text-muted-foreground mt-1">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}
