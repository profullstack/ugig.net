import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Star,
  Download,
  Zap,
  ArrowLeft,
  Calendar,
  Server,
  ExternalLink,
  Lock,
} from "lucide-react";
import { McpPurchaseButton } from "@/components/mcp/McpPurchaseButton";
import { McpReviewForm } from "@/components/mcp/McpReviewForm";
import { McpVoteButton } from "@/components/mcp/McpVoteButton";
import { ZapButton } from "@/components/zaps/ZapButton";
import { McpComments } from "@/components/mcp/McpComments";
import { McpDownloadButton } from "@/components/mcp/McpDownloadButton";
import { McpSecurityScanBadge } from "@/components/mcp/McpSecurityScanBadge";
import { McpScanButton } from "@/components/mcp/McpScanButton";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

interface McpDetailProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: McpDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("mcp_listings" as any)
    .select("title, tagline")
    .eq("slug", slug)
    .single();

  if (!listing) return { title: "MCP Server Not Found | ugig.net" };

  const title = `${(listing as any).title} | ugig.net MCP Servers`;
  const description = (listing as any).tagline || (listing as any).title;
  const url = `/mcp/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Sanitize a URL for safe external display. */
function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch { /* invalid */ }
  return null;
}

/** Truncate a URL for display. */
function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function fetchBtcRate(): Promise<number | null> {
  try {
    const res = await fetch("https://coinpayportal.com/api/rates?coin=BTC", { next: { revalidate: 300 } });
    const d = await res.json();
    return d.success && d.rate ? d.rate : null;
  } catch { return null; }
}

export default async function McpDetailPage({ params }: McpDetailProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("mcp_listings" as any)
    .select(
      `*, seller:profiles!seller_id (id, username, full_name, avatar_url, bio, account_type, verified)`
    )
    .eq("slug", slug)
    .single();

  if (!listing) notFound();

  const l = listing as any;

  // Check auth + purchase status + user vote + BTC rate
  const [{data: { user }}, btcUsd] = await Promise.all([
    supabase.auth.getUser(),
    fetchBtcRate(),
  ]);

  let purchased = false;
  let isOwner = false;
  let userVote: number | null = null;

  if (user) {
    isOwner = user.id === l.seller_id;
    if (!isOwner) {
      const { data: purchase } = await supabase
        .from("mcp_purchases" as any)
        .select("id")
        .eq("listing_id", l.id)
        .eq("buyer_id", user.id)
        .single();
      purchased = !!purchase;
    }

    // Get user's vote
    const { data: vote } = await supabase
      .from("mcp_votes" as any)
      .select("vote_type")
      .eq("listing_id", l.id)
      .eq("user_id", user.id)
      .single();

    if (vote) {
      userVote = (vote as any).vote_type;
    }
  }

  // Reviews
  const { data: reviews } = await supabase
    .from("mcp_reviews" as any)
    .select(
      `*, reviewer:profiles!reviewer_id (id, username, full_name, avatar_url)`
    )
    .eq("listing_id", l.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Zap totals
  const admin = createServiceClient();
  const { data: zapAgg } = await admin
    .from("zaps" as any)
    .select("amount_sats")
    .eq("target_type", "mcp")
    .eq("target_id", l.id);

  const zapsTotal = (zapAgg || []).reduce(
    (sum: number, z: any) => sum + (z.amount_sats || 0),
    0
  );

  // Fetch latest security scan
  const { data: latestScan } = await admin
    .from("mcp_security_scans" as any)
    .select("status, rating, security_score, findings, scanner_version, created_at, spidershield_report, mcp_scan_report")
    .eq("listing_id", l.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scan = latestScan as any;

  const hasServerUrl = !!l.mcp_server_url;
  const canAccess = isOwner || purchased;

  const sourceUrl = sanitizeUrl(l.source_url);
  const mcpServerUrl = sanitizeUrl(l.mcp_server_url);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Back */}
          <Link
            href="/mcp"
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
                  <h1 className="text-3xl font-bold">{l.title}</h1>
                  {l.category && (
                    <Link href={`/mcp?category=${encodeURIComponent(l.category)}`}>
                      <Badge
                        variant="outline"
                        className="capitalize shrink-0 mt-1 cursor-pointer hover:bg-muted transition-colors"
                      >
                        {l.category.replace("-", " ")}
                      </Badge>
                    </Link>
                  )}
                </div>
                {l.tagline && (
                  <p className="text-lg text-muted-foreground">{l.tagline}</p>
                )}
              </div>

              {/* Transport type + tools */}
              {(l.transport_type || (l.supported_tools && l.supported_tools.length > 0)) && (
                <div className="space-y-3">
                  {l.transport_type && (
                    <div>
                      <h2 className="text-sm font-medium text-muted-foreground mb-2">Transport</h2>
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                        {l.transport_type}
                      </Badge>
                    </div>
                  )}
                  {l.supported_tools && l.supported_tools.length > 0 && (
                    <div>
                      <h2 className="text-sm font-medium text-muted-foreground mb-2">Available Tools</h2>
                      <div className="flex flex-wrap gap-2">
                        {l.supported_tools.map((tool: string) => (
                          <Badge key={tool} variant="secondary">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              {l.tags && l.tags.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-muted-foreground mb-2">Tags</h2>
                  <div className="flex flex-wrap gap-2">
                    {l.tags.map((tag: string) => (
                      <Link
                        key={tag}
                        href={`/mcp?tag=${encodeURIComponent(tag)}`}
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

              {/* Stats + Social row */}
              <div className="flex items-center gap-6 text-sm text-muted-foreground border-y border-border py-3 flex-wrap">
                {/* Vote */}
                {user ? (
                  <McpVoteButton
                    slug={slug}
                    initialUpvotes={l.upvotes ?? 0}
                    initialDownvotes={l.downvotes ?? 0}
                    initialScore={l.score ?? 0}
                    initialUserVote={userVote}
                  />
                ) : (
                  <span className="flex items-center gap-1">
                    👍 {l.upvotes ?? 0}
                  </span>
                )}

                <span className="flex items-center gap-1.5">
                  <Download className="h-4 w-4" />
                  {l.downloads_count} connections
                </span>
                {l.rating_count > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    {Number(l.rating_avg).toFixed(1)} ({l.rating_count}{" "}
                    {l.rating_count === 1 ? "review" : "reviews"})
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {new Date(l.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Zap button */}
              {user && (
                <ZapButton
                  targetType="mcp"
                  targetId={l.id}
                  recipientId={l.seller_id}
                  totalSats={zapsTotal}
                />
              )}
              {!user && zapsTotal > 0 && (
                <span className="text-sm text-amber-500 flex items-center gap-1">
                  <Zap className="h-4 w-4 fill-amber-500" />
                  {zapsTotal.toLocaleString()} sats zapped
                </span>
              )}

              {/* Description */}
              <div>
                <h2 className="text-xl font-semibold mb-3">Description</h2>
                <MarkdownContent content={l.description || ""} />
              </div>

              {/* Links */}
              {sourceUrl && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Links</h3>
                  <div className="flex flex-col gap-1.5">
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                    >
                      <Server className="h-3.5 w-3.5 shrink-0" />
                      {displayUrl(sourceUrl)}
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                    </a>
                  </div>
                </div>
              )}

              {/* Comments */}
              <McpComments slug={slug} isAuthenticated={!!user} />

              {/* Reviews */}
              <div>
                <h2 className="text-xl font-semibold mb-4">
                  Reviews{" "}
                  {l.rating_count > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({l.rating_count})
                    </span>
                  )}
                </h2>

                {user && purchased && (
                  <div className="mb-6">
                    <McpReviewForm slug={slug} />
                  </div>
                )}

                {reviews && reviews.length > 0 ? (
                  <div className="space-y-4">
                    {(reviews as any[]).map((review) => (
                      <div
                        key={review.id}
                        className="p-4 border border-border rounded-lg bg-card"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <Avatar className="h-8 w-8">
                            {review.reviewer?.avatar_url && (
                              <AvatarImage src={review.reviewer.avatar_url} />
                            )}
                            <AvatarFallback>
                              {(review.reviewer?.username || "?")[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link
                              href={`/u/${review.reviewer?.username}`}
                              className="font-medium hover:underline"
                            >
                              {review.reviewer?.full_name ||
                                review.reviewer?.username}
                            </Link>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star
                                  key={i}
                                  className={`h-3.5 w-3.5 ${
                                    i < review.rating
                                      ? "text-amber-500 fill-amber-500"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              ))}
                              <span className="text-xs text-muted-foreground ml-2">
                                {new Date(review.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {review.comment && (
                          <p className="text-sm text-foreground/90">
                            {review.comment}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No reviews yet.
                  </p>
                )}
              </div>
            </div>

            {/* ─── Sidebar ──────────────────────────────────────── */}
            <div className="space-y-6">
              {/* Purchase / connect card */}
              <div className="p-6 border border-border rounded-lg bg-card sticky top-6">
                <div className="text-center mb-4">
                  {l.price_sats === 0 ? (
                    <p className="text-2xl font-bold text-green-500">Free</p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-amber-500 flex items-center justify-center gap-1">
                        <Zap className="h-6 w-6 fill-amber-500" />
                        {l.price_sats.toLocaleString()} sats
                      </p>
                      {btcUsd && (
                        <p className="text-sm text-muted-foreground mt-1">
                          ≈ ${((l.price_sats / 1e8) * btcUsd).toFixed(2)} USD
                        </p>
                      )}
                    </>
                  )}
                </div>

                {isOwner ? (
                  <div className="space-y-3">
                    <Link href={`/dashboard/mcp/${slug}/edit`}>
                      <button className="w-full py-2.5 px-4 rounded-lg bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors">
                        Edit Listing
                      </button>
                    </Link>
                    {hasServerUrl && (
                      <McpDownloadButton slug={slug} />
                    )}
                  </div>
                ) : purchased ? (
                  <div className="space-y-3 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-600 rounded-lg font-medium mb-2">
                      <Server className="h-4 w-4" /> Purchased
                    </div>
                    {hasServerUrl && (
                      <McpDownloadButton slug={slug} />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Available in your{" "}
                      <Link
                        href="/mcp/library"
                        className="text-primary hover:underline"
                      >
                        library
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <McpPurchaseButton
                      slug={slug}
                      priceSats={l.price_sats}
                    />
                    {hasServerUrl && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                        <Lock className="h-4 w-4" />
                        <span>
                          {l.price_sats === 0
                            ? "Claim free access to connect"
                            : "Purchase to get connection details"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Security scan */}
              <div className="p-6 border border-border rounded-lg bg-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Security Scan</h3>
                  <a
                    href="https://github.com/rodolfboctor/mcp-scan/tree/main"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex"
                    aria-label="Secured with mcp-scan"
                  >
                    <img
                      src="/badge-secure.svg"
                      alt="Secured with mcp-scan"
                      className="h-7 w-auto"
                    />
                  </a>
                </div>
                {scan ? (
                  <McpSecurityScanBadge
                    status={scan.status || "error"}
                    rating={scan.rating ?? null}
                    securityScore={scan.security_score ?? null}
                    findingsCount={Array.isArray(scan.findings) ? scan.findings.length : 0}
                    findings={Array.isArray(scan.findings) ? scan.findings : []}
                    scannedAt={scan.created_at}
                    scannerVersion={scan.scanner_version}
                    spidershieldAvailable={!!scan.spidershield_report?.available}
                    mcpScanAvailable={!!scan.mcp_scan_report?.available}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No scan yet.</p>
                )}

                {isOwner && <McpScanButton slug={slug} currentStatus={l.scan_status} />}
              </div>

              {/* Seller card */}
              <div className="p-6 border border-border rounded-lg bg-card">
                <h3 className="font-semibold mb-3">Publisher</h3>
                <Link
                  href={`/u/${l.seller?.username}`}
                  className="flex items-center gap-3 hover:bg-muted/50 -mx-2 px-2 py-2 rounded-lg transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    {l.seller?.avatar_url && (
                      <AvatarImage src={l.seller.avatar_url} />
                    )}
                    <AvatarFallback>
                      {(l.seller?.username || "?")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {l.seller?.full_name || l.seller?.username}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @{l.seller?.username}
                    </p>
                  </div>
                </Link>
                {l.seller?.bio && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap break-words">
                    {l.seller.bio}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
