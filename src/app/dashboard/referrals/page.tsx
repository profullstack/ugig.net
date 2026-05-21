"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, Send, Users, UserCheck, TrendingUp } from "lucide-react";

interface Referral {
  id: string;
  referred_email: string;
  status: string;
  created_at: string;
  registered_at: string | null;
}

interface Stats {
  total_invited: number;
  total_registered: number;
  conversion_rate: number;
}

async function loadReferrals() {
  const res = await fetch("/api/referrals");
  if (res.ok) return res.json();
  return null;
}

async function loadCode() {
  const res = await fetch("/api/referrals/code");
  if (res.ok) return res.json();
  return null;
}

function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the DOM fallback for blocked clipboard writes.
  }

  return copyWithTextarea(text);
}

export default function ReferralsPage() {
  const [referralLink, setReferralLink] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_invited: 0,
    total_registered: 0,
    conversion_rate: 0,
  });
  const [emails, setEmails] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadCode().then((data) => {
      if (data) {
        setReferralLink(data.link);
        setReferralCode(data.code);
      }
    });
    loadReferrals().then((data) => {
      if (data) {
        setReferrals(data.data || []);
        setStats(data.stats);
      }
    });
  }, []);

  const copyLink = async () => {
    setCopyError(null);

    const copiedLink = await copyText(referralLink);
    if (!copiedLink) {
      setCopied(false);
      setCopyError("Copy failed. Select the link and copy it manually.");
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendInvites = async () => {
    setError(null);
    setSuccess(null);
    setSending(true);

    const emailList = emails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emailList.length === 0) {
      setError("Please enter at least one email address");
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailList }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to send invites");
        return;
      }

      setSuccess(data?.message || "Invites sent");
      setEmails("");
      loadReferrals().then((d) => {
        if (d) {
          setReferrals(d.data || []);
          setStats(d.stats);
        }
      });
    } catch {
      setError("Failed to send invites");
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      registered: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || ""}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Invite Friends</h1>
        <p className="text-muted-foreground mt-1">
          Share your referral link and earn ⚡ 25 sats for each friend who signs up. They get 25
          sats too!
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <Users className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold">{stats.total_invited}</p>
            <p className="text-sm text-muted-foreground">Total Invited</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <UserCheck className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold">{stats.total_registered}</p>
            <p className="text-sm text-muted-foreground">Registered</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-2xl font-bold">{stats.conversion_rate}%</p>
            <p className="text-sm text-muted-foreground">Conversion Rate</p>
          </div>
        </div>
      </div>

      {/* Referral Link */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="font-semibold">Your Referral Link</h2>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {copyError && <p className="text-sm text-destructive">{copyError}</p>}
        <p className="text-xs text-muted-foreground">
          Your referral code: <span className="font-mono font-medium">{referralCode}</span>
        </p>
      </div>

      {/* Send Invites */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-3">
        <h2 className="font-semibold">Send Invites</h2>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="Enter email addresses separated by commas or new lines"
          rows={3}
          className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm resize-none"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
        <button
          onClick={sendInvites}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : "Send Invites"}
        </button>
      </div>

      {/* Referrals Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Sent Invites</h2>
        </div>
        {referrals.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No invites sent yet. Share your link or send invites above!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Invited</th>
                  <th className="text-left px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{r.referred_email}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.registered_at ? new Date(r.registered_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
