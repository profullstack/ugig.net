"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const COOKIE = "ugig_invite";

/** Keeps the code in a cookie through signup, or accepts it for a signed-in account. */
export function InviteLanding({ code, signedIn }: { code: string; signedIn: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.cookie = `${COOKIE}=${encodeURIComponent(code)}; Max-Age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax`;
  }, [code]);

  async function accept() {
    setBusy(true);
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg({ ok: res.ok, text: body.message || body.error || "Done" });
    document.cookie = `${COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  }

  if (signedIn) {
    return (
      <div className="space-y-3">
        <Button className="w-full" onClick={accept} disabled={busy || msg?.ok}>
          Accept invite
        </Button>
        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {msg.text}
          </p>
        )}
        <Link href="/dashboard/invites" className="block text-sm text-primary hover:underline">
          Go to your invites
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" asChild>
        <Link href={`/signup?invite=${encodeURIComponent(code)}`}>Create your account</Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        Just signed up?{" "}
        <Link href="/login?redirect=/dashboard/invites" className="text-primary hover:underline">
          Log in
        </Link>{" "}
        to accept it.
      </p>
    </div>
  );
}
