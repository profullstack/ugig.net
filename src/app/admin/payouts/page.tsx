import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PayoutActions } from "./PayoutActions";

export const metadata = { title: "PayPal payouts | ugig.net admin" };

interface Row {
  id: string;
  status: string;
  amount_usd: number;
  platform_fee_usd: number;
  payout_status: string | null;
  payout_currency: string | null;
  seller_payout_address: string;
  payout_tx_hash: string | null;
  funded_at: string | null;
  released_at: string | null;
  paypal_transaction_id: string | null;
  gig: { id: string; title: string } | null;
  seller: { username: string | null } | null;
  buyer: { username: string | null } | null;
}

export default async function PayoutsPage() {
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

  const { data } = await (createServiceClient() as any)
    .from("gig_orders")
    .select(
      "id, status, amount_usd, platform_fee_usd, payout_status, payout_currency, seller_payout_address, payout_tx_hash, " +
        "funded_at, released_at, paypal_transaction_id, gig:gigs(id, title), " +
        "seller:profiles!gig_orders_seller_id_fkey(username), buyer:profiles!gig_orders_buyer_id_fkey(username)"
    )
    .eq("payment_rail", "paypal")
    .in("status", ["funded", "delivered", "disputed", "released"])
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];
  const owed = rows.filter((r) => r.payout_status === "owed");
  const open = rows.filter((r) => r.status !== "released");
  const paid = rows.filter((r) => r.payout_status === "paid").slice(0, 25);

  const net = (r: Row) => Math.round((r.amount_usd - r.platform_fee_usd) * 100) / 100;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PayPal payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PayPal Buy now orders capture into ugig&apos;s PayPal. Pay each released order&apos;s seller, then mark it paid.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">← Admin</Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Owed ({owed.length})</h2>
        {owed.length === 0 && <p className="text-sm text-muted-foreground">Nothing owed.</p>}
        {owed.map((r) => (
          <div key={r.id} className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">{r.gig?.title ?? r.id} — pay @{r.seller?.username ?? "?"} <strong>${net(r)}</strong></p>
            <p className="text-muted-foreground">
              {r.payout_currency?.toUpperCase()} → <code className="break-all">{r.seller_payout_address}</code>
            </p>
            <p className="text-xs text-muted-foreground">Released {r.released_at ? new Date(r.released_at).toLocaleString() : "?"} · PayPal tx {r.paypal_transaction_id}</p>
            <PayoutActions orderId={r.id} mode="owed" />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Paid, not yet released ({open.length})</h2>
        {open.map((r) => (
          <div key={r.id} className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">{r.gig?.title ?? r.id} — ${r.amount_usd} · {r.status}</p>
            <p className="text-xs text-muted-foreground">
              buyer @{r.buyer?.username ?? "?"} · seller @{r.seller?.username ?? "?"} · paid {r.funded_at ? new Date(r.funded_at).toLocaleDateString() : "?"}
            </p>
            {r.status === "disputed" && <PayoutActions orderId={r.id} mode="disputed" />}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recently paid</h2>
        {paid.map((r) => (
          <p key={r.id} className="text-sm text-muted-foreground">
            ${net(r)} to @{r.seller?.username ?? "?"} — <code className="break-all">{r.payout_tx_hash}</code>
          </p>
        ))}
      </section>
    </div>
  );
}
