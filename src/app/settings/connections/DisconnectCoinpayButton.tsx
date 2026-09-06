"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Release the CoinPay link on this profile (#537).
 *
 * Without this, a CoinPay account attached to the wrong ugig profile stayed
 * there: the unique (provider, provider_user_id) row meant no other profile
 * could claim it, and nothing in the UI could give it up.
 */
export function DisconnectCoinpayButton({ account }: { account: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/coinpay", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Could not disconnect CoinPay.");
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch {
      setError("Could not disconnect CoinPay.");
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-destructive"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <Unlink className="h-4 w-4" />
          Disconnect
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm sm:max-w-sm">
      <p className="mb-1 font-medium">Disconnect {account}?</p>
      <p className="mb-3 text-muted-foreground">
        ugig will stop reading your CoinPay wallets, and this CoinPay account becomes free to
        connect to a different ugig profile. You can reconnect at any time.
      </p>
      {error && <p className="mb-3 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={disconnect} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Disconnect
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
