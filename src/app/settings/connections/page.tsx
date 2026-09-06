import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buttonVariants } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, LinkIcon, RefreshCw } from "lucide-react";
import { DisconnectCoinpayButton } from "./DisconnectCoinpayButton";

export const metadata = {
  title: "OAuth Connections | ugig.net",
  description: "Connect external accounts used by ugig.net",
};

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function statusMessage(status?: string, linkedTo?: string) {
  if (status === "connected") return "CoinPay connected.";
  if (status === "already_linked") {
    // Name the profile holding the link and say how to release it (#537).
    // "already connected to another ugig account" left the owner with nowhere
    // to go: no way to learn which account, and no way to take it back.
    return linkedTo
      ? `That CoinPay account is already connected to the ugig profile "${linkedTo}". Sign in as ${linkedTo}, disconnect CoinPay there, then connect it here.`
      : "That CoinPay account is already connected to another ugig profile. Sign in to that profile and disconnect CoinPay there, then connect it here.";
  }
  if (status === "expired") return "CoinPay connection expired. Try again.";
  return null;
}

export default async function OAuthConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ coinpay?: string; linked_to?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/settings/connections");
  }

  const serviceSupabase = createServiceClient();
  const { data: coinpayIdentity } = await (serviceSupabase as any)
    .from("oauth_identities")
    .select("email, provider_user_id, metadata, updated_at")
    .eq("user_id", user.id)
    .eq("provider", "coinpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata = metadataObject(coinpayIdentity?.metadata);
  const connectedAt =
    typeof metadata.connected_at === "string" ? metadata.connected_at : coinpayIdentity?.updated_at || null;
  const tokenExpiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
  const params = await searchParams;
  const message = statusMessage(params.coinpay, params.linked_to);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">OAuth Connections</h1>
          <p className="text-muted-foreground">
            Connect external accounts that ugig uses for payment and wallet workflows.
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            {message}
          </div>
        )}

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">CoinPay</h2>
                {coinpayIdentity && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect your CoinPay account so ugig can read your CoinPay global wallet addresses
                when you pay invoices.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 shrink-0 sm:items-end">
              <Link
                href="/api/auth/coinpay?mode=connect&redirect=/settings/connections"
                className={buttonVariants({ size: "sm", className: "gap-2 shrink-0" })}
              >
                {coinpayIdentity ? <RefreshCw className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
                {coinpayIdentity ? "Reconnect" : "Connect CoinPay"}
              </Link>
              {coinpayIdentity && (
                <DisconnectCoinpayButton
                  account={coinpayIdentity.email || "this CoinPay account"}
                />
              )}
            </div>
          </div>

          {coinpayIdentity ? (
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-border bg-background p-3">
                <dt className="text-xs font-medium text-muted-foreground">Account</dt>
                <dd className="mt-1 break-all">{coinpayIdentity.email || "Connected CoinPay account"}</dd>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <dt className="text-xs font-medium text-muted-foreground">Connected</dt>
                <dd className="mt-1">{connectedAt ? new Date(connectedAt).toLocaleString() : "Connected"}</dd>
              </div>
              {tokenExpiresAt && (
                <div className="rounded-md border border-border bg-background p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Token expires</dt>
                  <dd className="mt-1">{new Date(tokenExpiresAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="mt-5 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
              CoinPay is not connected yet. Connect it before paying invoices with CoinPay global wallets.
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link
              href="https://coinpayportal.com/settings/wallets"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Manage CoinPay global wallets
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
