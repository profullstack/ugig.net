"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Gift, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Invite = {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  usedAt: number | null;
  note: string;
  status: "open" | "used" | "expired" | "revoked";
  usedByUsername?: string | null;
  bonus?: "granted" | "pending";
};

type Overview = {
  quota: { total: number; used: number; left: number };
  invites: Invite[];
  canInvite: boolean;
  unlocksAt: string | null;
  bonusDays: number;
  referral: { code: string; link: string } | null;
};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function readInviteCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)ugig_invite=([^;]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function clearInviteCookie() {
  document.cookie = "ugig_invite=; Max-Age=0; path=/; SameSite=Lax";
}

export default function InvitesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ code: string; url: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [acceptMsg, setAcceptMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/invites");
    if (res.status === 401) {
      window.location.href = "/login?redirect=/dashboard/invites";
      return;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) setError(body?.error || "Could not load invites");
    else setData(body);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    setPendingInvite(readInviteCookie());
  }, [load]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setError(body.error || "Could not create an invite");
      return;
    }
    setFresh({ code: body.invite.code, url: body.invite.url });
    setNote("");
    load();
  }

  async function withdraw(id: string) {
    const res = await fetch(`/api/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not withdraw the invite");
    }
    load();
  }

  async function accept() {
    if (!pendingInvite) return;
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pendingInvite }),
    });
    const body = await res.json().catch(() => ({}));
    setAcceptMsg({ ok: res.ok, text: body.message || body.error || "Done" });
    clearInviteCookie();
    setPendingInvite(null);
    load();
  }

  async function doCopy(key: string, text: string) {
    if (await copy(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Invites</h1>
        </div>
      </div>

      {pendingInvite && (
        <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/10 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-sm">
            You opened an invite (<code className="font-mono">{pendingInvite}</code>). Accept it to join on it.
          </p>
          <Button onClick={accept}>Accept invite</Button>
        </div>
      )}
      {acceptMsg && (
        <p className={`mb-6 text-sm ${acceptMsg.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {acceptMsg.text}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <section className="p-6 rounded-lg border border-border">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h2 className="text-lg font-semibold">Invite someone</h2>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {data.quota.left} of {data.quota.total} left
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Invites are scarce on purpose. Each one works once, for a new account, and expires after 30 days.
              When the person you invite confirms their email, you both get {data.bonusDays} days of Pro.
            </p>
            {!data.canInvite ? (
              <p className="text-sm text-muted-foreground">
                {data.unlocksAt
                  ? `Your invites unlock on ${new Date(data.unlocksAt).toLocaleDateString()}, a week after you joined.`
                  : "This account cannot send invites."}
              </p>
            ) : data.quota.left > 0 ? (
              <form onSubmit={createInvite} className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Who is it for? (only you see this)"
                  maxLength={200}
                />
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create invite"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">You have used all your invites.</p>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {fresh && (
              <div className="mt-4 p-4 rounded-md bg-muted/50 space-y-2">
                <p className="text-sm font-medium">
                  Your invite. Copy it now: it is shown only once.
                </p>
                <div className="flex gap-2 items-center">
                  <code className="font-mono text-sm break-all flex-1">{fresh.url}</code>
                  <Button size="sm" variant="outline" onClick={() => doCopy("fresh", fresh.url)}>
                    <Copy className="h-4 w-4 mr-1" />
                    {copied === "fresh" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Code: <code className="font-mono">{fresh.code}</code></p>
              </div>
            )}
          </section>

          <section className="p-6 rounded-lg border border-border">
            <h2 className="text-lg font-semibold mb-4">Your invites</h2>
            {data.invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invites yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.invites.map((inv) => (
                  <li key={inv.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{inv.note || "Invite"}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.status === "used"
                          ? `Joined: ${inv.usedByUsername ? "@" + inv.usedByUsername : "a new member"} · bonus ${inv.bonus === "granted" ? "granted" : "pending confirmation"}`
                          : inv.status === "open"
                            ? `Open · expires ${inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "never"}`
                            : inv.status === "expired"
                              ? "Expired"
                              : "Withdrawn"}
                      </p>
                    </div>
                    {inv.status === "open" && (
                      <Button size="sm" variant="ghost" onClick={() => withdraw(inv.id)}>
                        Withdraw
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.referral && (
            <section className="p-6 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Your referral link</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Not scarce: share it anywhere. Sign-ups through it count as your referrals.
              </p>
              <div className="flex gap-2 items-center">
                <code className="font-mono text-sm break-all flex-1">{data.referral.link}</code>
                <Button size="sm" variant="outline" onClick={() => doCopy("ref", data.referral!.link)}>
                  <Copy className="h-4 w-4 mr-1" />
                  {copied === "ref" ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Email invitations and referral stats live on{" "}
                <Link href="/dashboard/referrals" className="underline">
                  Referrals
                </Link>
                .
              </p>
            </section>
          )}

          <p className="text-sm text-muted-foreground">
            Got a credit code instead?{" "}
            <Link href="/dashboard/subscription#redeem" className="underline">
              Redeem it on Subscription
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
