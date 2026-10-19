"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PayoutActions({ orderId, mode }: { orderId: string; mode: "owed" | "disputed" }) {
  const router = useRouter();
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Failed");
    else router.refresh();
  };

  return (
    <div className="pt-2 space-y-2">
      {mode === "owed" ? (
        <div className="flex gap-2">
          <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="Tx hash or PayPal transaction ID" />
          <Button size="sm" disabled={busy || txHash.trim().length < 8} onClick={() => act({ action: "paid", tx_hash: txHash })}>
            Mark paid
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => act({ action: "release" })}>Release to seller</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "refunded" })}>
            Refunded buyer in PayPal
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
