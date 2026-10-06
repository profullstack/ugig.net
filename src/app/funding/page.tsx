import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FundingClient } from "@/components/funding/FundingClient";
import { FundingProgress } from "@/components/funding/FundingProgress";
import { PaymentStatus } from "@/components/funding/PaymentStatus";
import { TopContributors } from "@/components/funding/TopContributors";
import { FUNDING_LIFETIME_THRESHOLD_USD, formatUsd } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Fund ugig.net | Support Development",
  description:
    `Support ugig.net development. Contributions of ${formatUsd(FUNDING_LIFETIME_THRESHOLD_USD)} or more include a Lifetime membership.`,
};

export default async function FundingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-10">
          <section className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">
              Fund ugig.net ⚡
            </h1>
            <p className="text-muted-foreground text-lg">
              Support ugig.net development. Contributions of{" "}
              {formatUsd(FUNDING_LIFETIME_THRESHOLD_USD)} or more include a
              Lifetime membership: unlimited gig posts and the lower
              marketplace seller fee, forever.
            </p>
          </section>

          <PaymentStatus />
          <FundingProgress />

          <FundingClient />

          <section className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">
              Recent Contributions 💳⚡
            </h2>
            <TopContributors />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
