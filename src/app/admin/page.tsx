import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { IntegrationsManager } from "./integrations-form";

export const metadata = {
  title: "Admin · ugig",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await (supabase as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  // 404 (not redirect) so a non-admin can't fingerprint the route.
  if (!me?.is_admin) notFound();

  const svc = createServiceClient();
  const { data: integrationsRaw } = await (svc as any)
    .from("autoblog_integrations")
    .select(
      "id, name, kind, access_token, created_at, last_used_at, request_count",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inbound autoblog webhooks (Outrank, Crawlproof).
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">PayPal payouts</h2>
        <p className="mt-1 text-sm text-muted-foreground">Buy now orders paid by PayPal: sellers ugig owes, and disputes.</p>
        <div className="mt-4">
          <Link href="/admin/payouts" className="text-sm font-semibold underline hover:opacity-80">
            Open payouts →
          </Link>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Email broadcast</h2>
        <p className="mt-1 text-sm text-muted-foreground">Send a mass email to all registered users.</p>
        <div className="mt-4">
          <Link href="/admin/email-broadcast" className="text-sm font-semibold underline hover:opacity-80">
            Compose &amp; send →
          </Link>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Autoblog integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each bearer token doubles as the HMAC secret for the Standard
          Webhooks signature on inbound deliveries.
        </p>
        <div className="mt-5">
          <IntegrationsManager initial={integrationsRaw ?? []} />
        </div>
      </section>
    </div>
  );
}
