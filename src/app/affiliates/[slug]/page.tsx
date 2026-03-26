"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { ArrowLeft, Users, TrendingUp, Calendar, ExternalLink, Zap } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface AffiliateOffer {
  id: string;
  slug: string;
  title: string;
  description: string;
  product_type: string;
  product_url: string | null;
  price_sats: number;
  commission_rate: number;
  commission_type: string;
  commission_flat_sats: number;
  cookie_days: number;
  settlement_delay_days: number;
  promo_text: string | null;
  total_affiliates: number;
  total_conversions: number;
  total_revenue_sats: number;
  category: string | null;
  tags: string[];
  created_at: string;
  seller_id: string;
  profiles?: { username: string; avatar_url: string | null };
  skill_listings?: { title: string; slug: string; price_sats: number } | null;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K`;
  return sats.toLocaleString();
}

export default function OfferDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<AffiliateOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [btcUsd, setBtcUsd] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/rates/btc")
      .then((r) => r.json())
      .then((d) => { if (d.rate) setBtcUsd(d.rate); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (d.user?.id) setCurrentUserId(d.user.id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/affiliates/offers?slug=${encodeURIComponent(slug)}&limit=1`)
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        const found = data.offers?.[0];
        if (found) {
          const detailRes = await fetch(`/api/affiliates/offers/${found.id}`);
          const detail = await detailRes.json();
          if (!cancelled) setOffer(detail.offer);
        }
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  async function handleApply() {
    if (!offer) return;
    setApplying(true);
    setError("");

    const res = await fetch(`/api/affiliates/offers/${offer.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (res.ok) {
      setApplied(true);
      setTrackingUrl(data.tracking_url);
    } else {
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setError(data.error || "Failed to apply");
      // If already applied, show tracking URL if available
      if (res.status === 409) {
        setApplied(true);
      }
    }
    setApplying(false);
  }

  if (loading) {
    return (
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (!offer) {
    return (
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <p className="text-muted-foreground">Offer not found</p>
        <Link href="/affiliates" className="text-primary hover:underline mt-2 inline-block">
          ← Back to marketplace
        </Link>
      </main>
    );
  }

  const commissionDisplay = offer.commission_type === "flat"
    ? `${formatSats(offer.commission_flat_sats)} sats per sale`
    : `${Math.round(offer.commission_rate * 100)}% per sale`;

  return (
    <main className="flex-1 container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Back */}
        <Link
          href="/affiliates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to marketplace
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ─── Main content ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title + category */}
            <div>
              <div className="flex items-start gap-3 mb-2">
                <h1 className="text-3xl font-bold">{offer.title}</h1>
                <Badge
                  variant="outline"
                  className="capitalize shrink-0 mt-1"
                >
                  {offer.product_type}
                </Badge>
                {currentUserId && currentUserId === offer.seller_id && (
                  <Link href={`/affiliates/${slug}/edit`}>
                    <Button variant="outline" size="sm" className="shrink-0 mt-0.5">Edit</Button>
                  </Link>
                )}
              </div>

              {/* Seller */}
              {offer.profiles?.username && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>by</span>
                  <Link
                    href={`/u/${offer.profiles.username}`}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Avatar className="h-5 w-5">
                      {offer.profiles.avatar_url ? (
                        <AvatarImage src={offer.profiles.avatar_url} alt={offer.profiles.username} />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {offer.profiles.username[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    @{offer.profiles.username}
                  </Link>
                </div>
              )}
            </div>

            {/* Tags */}
            {offer.tags.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {offer.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/affiliates?tag=${encodeURIComponent(tag)}`}
                    >
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 transition-colors"
                      >
                        {tag}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-6 text-sm text-muted-foreground border-y border-border py-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {offer.total_affiliates} affiliates
              </span>
              <span className="flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" />
                {offer.total_conversions} sales
              </span>
              {offer.total_revenue_sats > 0 && (
                <span>{formatSats(offer.total_revenue_sats)} sats volume</span>
              )}
              {offer.cookie_days > 0 && (
                <span className="flex items-center gap-1.5">
                  🍪 {offer.cookie_days}-day cookie
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {new Date(offer.created_at).toLocaleDateString()}
              </span>
            </div>

            {/* Linked skill */}
            {offer.skill_listings && (
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-sm text-muted-foreground">Linked skill: </span>
                <Link
                  href={`/skills/${offer.skill_listings.slug}`}
                  className="text-primary hover:underline"
                >
                  {offer.skill_listings.title}
                </Link>
                {offer.skill_listings.price_sats > 0 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    ({formatSats(offer.skill_listings.price_sats)} sats)
                  </span>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold mb-3">Description</h2>
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <MarkdownContent content={offer.description} />
              </div>
            </div>

            {/* Promotional Materials */}
            {offer.promo_text && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Promotional Materials</h2>
                <div className="border rounded-lg p-4">
                  <MarkdownContent content={offer.promo_text} />
                </div>
              </div>
            )}
          </div>

          {/* ─── Sidebar ──────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Commission card */}
            <div className="p-6 border border-border rounded-lg bg-card sticky top-6">
              <div className="text-center mb-4">
                <p className="text-2xl font-bold text-amber-500 flex items-center justify-center gap-1">
                  <Zap className="h-6 w-6 fill-amber-500" />
                  {commissionDisplay}
                </p>
                {(() => {
                  if (offer.commission_type === "percentage" && offer.price_sats > 0) {
                    const usd = (offer.price_sats * offer.commission_rate).toFixed(2);
                    return (
                      <p className="text-sm text-muted-foreground mt-1">
                        ≈ ${usd} USD per sale
                      </p>
                    );
                  }
                  if (offer.commission_type === "flat" && offer.commission_flat_sats > 0 && btcUsd) {
                    const usd = ((offer.commission_flat_sats / 1e8) * btcUsd).toFixed(2);
                    return (
                      <p className="text-sm text-muted-foreground mt-1">
                        ≈ ${usd} USD per sale
                      </p>
                    );
                  }
                  return null;
                })()}
                {offer.price_sats > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Product price: ${Number(offer.price_sats).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </p>
                )}
              </div>

              <div className="space-y-2 text-sm border-t border-border pt-4 mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cookie window</span>
                  <span>{offer.cookie_days} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Settlement delay</span>
                  <span>{offer.settlement_delay_days} days</span>
                </div>
              </div>

              {applied ? (
                <div className="space-y-3">
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      ✅ You&apos;re an affiliate!
                    </p>
                  </div>
                  {trackingUrl && (
                    <div>
                      <label className="text-xs text-muted-foreground">Your tracking link:</label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          readOnly
                          value={trackingUrl}
                          className="text-xs font-mono"
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigator.clipboard.writeText(trackingUrl)}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? "Applying..." : "Become an Affiliate"}
                </Button>
              )}

              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}
            </div>

            {offer.product_url && (
              <a
                href={offer.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                {(() => {
                  try {
                    const parts = new URL(offer.product_url).hostname.split(".");
                    return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
                  } catch { return "View Product"; }
                })()}
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${props.className || ""}`}
    />
  );
}
