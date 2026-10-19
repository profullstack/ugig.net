"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * PayPal payout email: how a seller without a crypto wallet gets paid for
 * Buy now orders (buyers pay by card or PayPal). Private, never shown on the
 * profile.
 */
export function PaypalPayoutForm() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/payout-paypal")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSaved(data.paypal_email ?? null);
        setEmail(data.paypal_email ?? "");
        setEnabled(data.paypal_buy_now !== false);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (value: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/payout-paypal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypal_email: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data.error || "Couldn't save" });
        return;
      }
      setSaved(data.paypal_email ?? null);
      setEmail(data.paypal_email ?? "");
      setMessage({ ok: true, text: value ? "Saved." : "Removed." });
    } catch {
      setMessage({ ok: false, text: "Couldn't save" });
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="border border-border rounded-lg p-6 bg-card space-y-3" id="paypal-payout">
      <div>
        <h2 className="font-semibold">Get paid by PayPal</h2>
        <p className="text-sm text-muted-foreground mt-1">
          No crypto wallet? Add the email of your PayPal account. Buyers can then pay your fixed-price listings by
          card or PayPal, and when they release an order ugig sends you the price minus its fee by PayPal. This email
          is private: it isn&apos;t shown on your profile or to buyers.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="paypal-payout-email">PayPal email</Label>
        <div className="flex gap-2">
          <Input
            id="paypal-payout-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            disabled={loading || busy}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            type="button"
            disabled={loading || busy || !email.trim() || email.trim().toLowerCase() === saved}
            onClick={() => save(email.trim())}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          {saved && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => save(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? "text-green-600" : "text-red-600"}`}>{message.text}</p>
      )}
    </div>
  );
}
