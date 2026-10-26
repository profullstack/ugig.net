"use client";

import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "Have a code?": redeem a credit code for days of Pro. */
export function RedeemCodeCard({ onRedeemed }: { onRedeemed?: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/credits/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: body.error || "Could not redeem the code." });
        return;
      }
      const until = body.current_period_end
        ? ` Pro is active until ${new Date(body.current_period_end).toLocaleDateString()}.`
        : "";
      setResult({ ok: true, text: `Redeemed: ${body.granted?.amount ?? ""} days of Pro.${until}` });
      setCode("");
      onRedeemed?.();
    } catch {
      setResult({ ok: false, text: "Could not redeem the code. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 rounded-lg border border-border" id="redeem">
      <div className="flex items-center gap-2 mb-2">
        <Gift className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Have a code?</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Someone gave you a ugig credit code? Redeem it here for days of Pro.
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CR-XXXX-XXXX-XXXX-XXXX"
          aria-label="Credit code"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
        </Button>
      </form>
      {result && (
        <p
          role="status"
          className={`mt-3 text-sm ${result.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
