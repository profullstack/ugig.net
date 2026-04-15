"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDialog } from "@/components/providers/DialogProvider";
import { SatsFiatHint } from "@/components/ui/SatsAmount";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Copy,
  Check,
  MousePointerClick,
  TrendingUp,
  Zap,
  Users,
  Pencil,
  Plus,
  X,
  Trash2,
} from "lucide-react";

interface OfferInfo {
  id: string;
  title: string;
  slug: string;
  status: string;
  commission_rate: number;
  commission_type: string;
  commission_flat_sats: number;
  total_clicks: number;
  total_conversions: number;
  total_revenue_sats: number;
  total_commissions_sats: number;
  auto_pay: boolean;
  settlement_delay_days: number;
}

interface AffiliateEntry {
  application_id: string;
  affiliate_id: string;
  username: string | null;
  avatar_url: string | null;
  status: string;
  tracking_code: string;
  tracking_url: string | null;
  clicks_30d: number;
  conversions: number;
  earned_sats: number;
  pending_sats: number;
  applied_at: string;
  approved_at: string | null;
}

interface ConversionEntry {
  id: string;
  affiliate_id: string;
  username: string | null;
  sale_amount_sats: number;
  commission_sats: number;
  status: string;
  source: string;
  note: string | null;
  created_at: string;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K`;
  return sats.toLocaleString();
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 mr-1" />
          {label && <span className="text-xs">{label}</span>}
        </>
      )}
    </Button>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="p-5 bg-card rounded-lg border border-border shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold">
            {value}
            {suffix && (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                {suffix}
              </span>
            )}
            {suffix === "sats" && typeof value === "string" && (
              <span className="text-sm font-normal ml-1">
                <SatsFiatHint sats={parseInt(value.replace(/,/g, "")) || 0} />
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function SellerOfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { alert, confirm } = useDialog();
  const [offer, setOffer] = useState<OfferInfo | null>(null);
  const [affiliates, setAffiliates] = useState<AffiliateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [conversions, setConversions] = useState<ConversionEntry[]>([]);
  const [conversionForm, setConversionForm] = useState<string | null>(null); // affiliate_id or null
  const [convAmount, setConvAmount] = useState("");
  const [convNote, setConvNote] = useState("");
  const [convSubmitting, setConvSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/affiliates/offers/${id}/affiliates`);
      if (res.status === 401) {
        router.replace("/login?redirect=/dashboard/affiliates");
        return;
      }
      if (res.status === 403 || res.status === 404) {
        setError("Offer not found or you don't have access.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load offer");
        setLoading(false);
        return;
      }
      setOffer(data.offer);
      setAffiliates(data.affiliates);

      // Also fetch conversions
      try {
        const convRes = await fetch(`/api/affiliates/offers/${id}/conversions`);
        if (convRes.ok) {
          const convData = await convRes.json();
          setConversions(convData.conversions || []);
        }
      } catch {
        // Non-critical, ignore
      }

      setLoading(false);
    } catch {
      setError("Failed to load offer details");
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAction(
    applicationId: string,
    action: "approve" | "reject"
  ) {
    setActionLoading(applicationId);
    try {
      const res = await fetch(`/api/affiliates/offers/${id}/applications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, action }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRecordConversion(affiliateId: string) {
    const amount = parseInt(convAmount, 10);
    if (!amount || amount <= 0) return;

    setConvSubmitting(true);
    try {
      const res = await fetch(`/api/affiliates/offers/${id}/conversions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliate_id: affiliateId,
          sale_amount_sats: amount,
          note: convNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConversionForm(null);
        setConvAmount("");
        setConvNote("");
        await fetchData();
      } else {
        await alert(data.error || "Failed to record conversion");
      }
    } catch (err) {
      await alert("Failed to record conversion. Please try again.");
    } finally {
      setConvSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading offer details...</p>
      </main>
    );
  }

  if (error || !offer) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{error || "Not found"}</p>
          <Link href="/dashboard/affiliates">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </main>
    );
  }

  const commissionDisplay =
    offer.commission_type === "flat"
      ? `${formatSats(offer.commission_flat_sats || 0)} sats/sale`
      : `${Math.round((offer.commission_rate || 0) * 100)}%`;

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/affiliates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{offer.title}</h1>
              <Badge
                variant={offer.status === "active" ? "default" : "secondary"}
              >
                {offer.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Commission: {commissionDisplay} · Settlement: {offer.settlement_delay_days || 7} days
            </p>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={offer.auto_pay || false}
                onChange={async (e) => {
                  const newVal = e.target.checked;
                  const res = await fetch(`/api/affiliates/offers/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ auto_pay: newVal }),
                  });
                  if (res.ok) {
                    setOffer({ ...offer, auto_pay: newVal });
                  } else {
                    await alert("Failed to update auto-pay setting");
                  }
                }}
                className="rounded border-border"
              />
              <span className="text-sm text-muted-foreground">
                Auto-pay commissions after settlement period
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton
              text={`${typeof window !== "undefined" ? window.location.origin : ""}/affiliates/${offer.slug}`}
              label="Copy shareable link"
            />
            <Link href={`/affiliates/${offer.slug}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" />
                Edit Offer
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Clicks"
          value={offer.total_clicks}
          icon={MousePointerClick}
        />
        <StatCard
          label="Conversions"
          value={offer.total_conversions}
          icon={TrendingUp}
        />
        <StatCard
          label="Revenue"
          value={formatSats(offer.total_revenue_sats)}
          suffix="sats"
          icon={Zap}
        />
        <StatCard
          label="Commissions Paid"
          value={formatSats(offer.total_commissions_sats)}
          suffix="sats"
          icon={Users}
        />
      </div>

      {/* Affiliates table */}
      <h2 className="text-xl font-semibold mb-4">
        Affiliates ({affiliates.length})
      </h2>

      {affiliates.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            No affiliates have joined this program yet
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Affiliate</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Tracking URL</th>
                  <th className="text-right p-3 font-medium">Clicks (30d)</th>
                  <th className="text-right p-3 font-medium">Conversions</th>
                  <th className="text-right p-3 font-medium">Earned</th>
                  <th className="text-right p-3 font-medium">Joined</th>
                  <th className="text-center p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((aff) => (
                  <React.Fragment key={aff.application_id}>
                  <tr className="border-t border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {aff.avatar_url ? (
                          <img
                            src={aff.avatar_url}
                            alt=""
                            className="h-7 w-7 rounded-full"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                            {(aff.username || "?")[0].toUpperCase()}
                          </div>
                        )}
                        {aff.username ? (
                          <Link
                            href={`/@${aff.username}`}
                            className="font-medium hover:underline"
                          >
                            @{aff.username}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant={
                          aff.status === "approved"
                            ? "default"
                            : aff.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {aff.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {aff.tracking_url ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono max-w-[180px] truncate">
                            {aff.tracking_code}
                          </code>
                          <CopyButton text={aff.tracking_url} />
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right p-3">{aff.clicks_30d}</td>
                    <td className="text-right p-3">{aff.conversions}</td>
                    <td className="text-right p-3">
                      <span className="inline-flex items-center gap-1">
                        <Zap className="h-3 w-3 text-amber-500" />
                        {formatSats(aff.earned_sats)}
                      </span>
                    </td>
                    <td className="text-right p-3 text-muted-foreground">
                      {new Date(aff.applied_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {aff.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={actionLoading === aff.application_id}
                              onClick={() =>
                                handleAction(aff.application_id, "approve")
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionLoading === aff.application_id}
                              onClick={() =>
                                handleAction(aff.application_id, "reject")
                              }
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {aff.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            title="Record conversion"
                            onClick={() => {
                              setConversionForm(
                                conversionForm === aff.affiliate_id
                                  ? null
                                  : aff.affiliate_id
                              );
                              setConvAmount("");
                              setConvNote("");
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Inline conversion form */}
                  {conversionForm === aff.affiliate_id && (
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={8} className="p-3">
                        <div className="flex items-center gap-3 max-w-xl">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            Record sale for @{aff.username || "unknown"}:
                          </span>
                          <input
                            type="number"
                            placeholder="Amount (sats)"
                            min="1"
                            value={convAmount}
                            onChange={(e) => setConvAmount(e.target.value)}
                            className="w-32 px-2 py-1.5 text-sm border border-border rounded bg-background"
                          />
                          <input
                            type="text"
                            placeholder="Note (optional)"
                            value={convNote}
                            onChange={(e) => setConvNote(e.target.value)}
                            className="flex-1 px-2 py-1.5 text-sm border border-border rounded bg-background"
                          />
                          <Button
                            size="sm"
                            disabled={convSubmitting || !convAmount}
                            onClick={() =>
                              handleRecordConversion(aff.affiliate_id)
                            }
                          >
                            {convSubmitting ? "..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConversionForm(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Recent Conversions */}
      <h2 className="text-xl font-semibold mt-10 mb-4">
        Recent Conversions ({conversions.length})
      </h2>

      {conversions.length === 0 ? (
        <div className="text-center py-8 bg-card border border-border rounded-lg">
          <p className="text-muted-foreground">No conversions recorded yet</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Affiliate</th>
                  <th className="text-right p-3 font-medium">Sale Amount</th>
                  <th className="text-right p-3 font-medium">Commission</th>
                  <th className="text-center p-3 font-medium">Source</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Note</th>
                  <th className="text-center p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((conv) => (
                  <tr key={conv.id} className="border-t border-border">
                    <td className="p-3 text-muted-foreground">
                      {new Date(conv.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      {conv.username ? (
                        <Link
                          href={`/@${conv.username}`}
                          className="font-medium hover:underline"
                        >
                          @{conv.username}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )}
                    </td>
                    <td className="text-right p-3">
                      <span className="inline-flex items-center gap-1">
                        <Zap className="h-3 w-3 text-amber-500" />
                        {formatSats(conv.sale_amount_sats)}
                      </span>
                    </td>
                    <td className="text-right p-3">
                      {formatSats(conv.commission_sats)} sats
                    </td>
                    <td className="text-center p-3">
                      <Badge
                        variant={
                          conv.source === "manual" ? "secondary" : "default"
                        }
                      >
                        {conv.source}
                      </Badge>
                    </td>
                    <td className="text-center p-3">
                      <Badge
                        variant={
                          conv.status === "paid"
                            ? "default"
                            : conv.status === "clawed_back"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {conv.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">
                      {conv.note || "—"}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {conv.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                              onClick={async () => {
                                if (!await confirm(`Pay ${conv.commission_sats.toLocaleString()} sats commission to @${conv.username || "affiliate"}?`)) return;
                                const res = await fetch(`/api/affiliates/offers/${id}/conversions/pay`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ conversion_id: conv.id }),
                                });
                                const data = await res.json();
                                if (res.ok) {
                                  await fetchData();
                                } else {
                                  await alert(data.error || "Payment failed");
                                }
                              }}
                            >
                              <Zap className="h-3 w-3 mr-1" /> Pay
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={async () => {
                                const newNote = prompt("Edit note:", conv.note || "");
                                if (newNote === null) return;
                                const newAmount = prompt("Edit sale amount (sats):", String(conv.sale_amount_sats));
                                if (newAmount === null) return;
                                const res = await fetch(`/api/affiliates/offers/${id}/conversions`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    conversion_id: conv.id,
                                    note: newNote,
                                    sale_amount_sats: parseInt(newAmount) || conv.sale_amount_sats,
                                  }),
                                });
                                if (res.ok) {
                                  await fetchData();
                                } else {
                                  const data = await res.json();
                                  await alert(data.error || "Failed to update");
                                }
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
                              onClick={async () => {
                                if (!await confirm("Delete this conversion?")) return;
                                const res = await fetch(`/api/affiliates/offers/${id}/conversions`, {
                                  method: "DELETE",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ conversion_id: conv.id }),
                                });
                                if (res.ok) {
                                  await fetchData();
                                } else {
                                  const data = await res.json();
                                  await alert(data.error || "Failed to delete");
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {conv.status === "paid" && (
                          <span className="text-xs text-green-500">✓ Paid</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
