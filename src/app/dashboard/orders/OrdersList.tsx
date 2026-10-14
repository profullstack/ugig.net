"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Party {
  id: string;
  username: string | null;
}

export interface OrderListItem {
  id: string;
  gig_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  amount_usd: number;
  platform_fee_usd: number;
  currency: string;
  amount_crypto: number | null;
  escrow_address: string | null;
  requirements: string | null;
  delivery_note: string | null;
  expires_at: string | null;
  created_at: string;
  gig: { id: string; title: string } | null;
  buyer: Party | null;
  seller: Party | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  funded: "Paid, in progress",
  delivered: "Delivered",
  released: "Released",
  refunded: "Refunded",
  disputed: "Disputed",
  expired: "Expired",
};

type Tab = "bought" | "sold";

export function OrdersList({ currentUserId }: { currentUserId: string }) {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [tab, setTab] = useState<Tab>("bought");
  const [error, setError] = useState<string | null>(null);

  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/orders")
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setError(data.error || "Failed to load orders");
        else setOrders(data.orders);
      })
      .catch(() => !cancelled && setError("Failed to load orders"));
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!orders) return <Loader2 className="h-5 w-5 animate-spin" />;

  const bought = orders.filter((o) => o.buyer_id === currentUserId);
  const sold = orders.filter((o) => o.seller_id === currentUserId);
  const shown = tab === "bought" ? bought : sold;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Button variant={tab === "bought" ? "default" : "outline"} size="sm" onClick={() => setTab("bought")}>
          Bought ({bought.length})
        </Button>
        <Button variant={tab === "sold" ? "default" : "outline"} size="sm" onClick={() => setTab("sold")}>
          Sold ({sold.length})
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground">
          {tab === "bought"
            ? "No orders yet. Look for a Buy now button on fixed-price for-hire listings."
            : "No orders yet. Fixed-price for-hire listings get a Buy now button once your CoinPay wallet is connected."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((o) => (
            <OrderCard key={o.id} order={o} isBuyer={tab === "bought"} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, isBuyer, onChange }: { order: OrderListItem; isBuyer: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"deliver" | "dispute" | null>(null);
  const [text, setText] = useState("");

  const act = async (action: "deliver" | "release" | "dispute", body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setMode(null);
      setText("");
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const counterpart = isBuyer ? order.seller : order.buyer;
  const net = Math.round((order.amount_usd - order.platform_fee_usd) * 100) / 100;
  const paid = order.status === "funded" || order.status === "delivered";

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/gigs/${order.gig_id}`} className="font-medium hover:underline">
            {order.gig?.title ?? "Listing"}
          </Link>
          <p className="text-sm text-muted-foreground">
            {isBuyer ? "Seller" : "Buyer"}:{" "}
            {counterpart?.username ? <Link href={`/u/${counterpart.username}`} className="hover:underline">@{counterpart.username}</Link> : "—"}
            {" · "}${order.amount_usd}
            {!isBuyer && ` (you receive $${net} after ugig's fee)`}
          </p>
        </div>
        <Badge variant="outline">{STATUS_LABEL[order.status] ?? order.status}</Badge>
      </div>

      {order.requirements && <p className="mt-2 text-sm whitespace-pre-wrap"><strong>Requirements:</strong> {order.requirements}</p>}
      {order.delivery_note && <p className="mt-2 text-sm whitespace-pre-wrap"><strong>Delivery:</strong> {order.delivery_note}</p>}

      {isBuyer && order.status === "pending_payment" && order.escrow_address && (
        <p className="mt-2 text-sm text-muted-foreground">
          Send {order.amount_crypto ?? ""} {order.currency.toUpperCase()} to{" "}
          <code className="break-all">{order.escrow_address}</code>
        </p>
      )}
      {paid && order.expires_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          Auto-releases to the seller on {new Date(order.expires_at).toLocaleDateString()} unless disputed.
        </p>
      )}

      {mode && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={mode === "deliver" ? "Link to the work, notes for the buyer (optional)" : "What went wrong?"}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || (mode === "dispute" && text.trim().length < 10)}
              onClick={() => act(mode, mode === "deliver" ? { note: text || undefined } : { reason: text })}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "deliver" ? "Mark delivered" : "Open dispute"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!isBuyer && order.status === "funded" && (
            <Button size="sm" onClick={() => setMode("deliver")}>Mark delivered</Button>
          )}
          {isBuyer && paid && (
            <>
              <Button size="sm" disabled={busy} onClick={() => act("release")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Release $${order.amount_usd}`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode("dispute")}>Dispute</Button>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
