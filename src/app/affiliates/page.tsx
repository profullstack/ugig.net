import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Megaphone, Users, TrendingUp, Zap } from "lucide-react";
import { SKILL_CATEGORIES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Affiliate Marketplace | ugig.net",
  description: "Promote products and earn commissions in sats. Browse affiliate offers on ugig.net.",
  alternates: { canonical: "/affiliates" },
  openGraph: {
    title: "Affiliate Marketplace | ugig.net",
    description: "Promote products and earn commissions in sats. Browse affiliate offers on ugig.net.",
    url: "/affiliates",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Affiliate Marketplace | ugig.net",
    description: "Promote products and earn commissions in sats. Browse affiliate offers on ugig.net.",
  },
};

interface AffiliatesPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    tag?: string;
    sort?: string;
    page?: string;
  }>;
}

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}K`;
  return sats.toLocaleString();
}

function commissionDisplay(offer: {
  commission_type: string;
  commission_rate: number;
  commission_flat_sats: number;
}): string {
  if (offer.commission_type === "flat") {
    return `${formatSats(offer.commission_flat_sats)} sats/sale`;
  }
  return `${Math.round(offer.commission_rate * 100)}%`;
}

function commissionUsdHint(offer: {
  commission_type: string;
  commission_rate: number;
  commission_flat_sats: number;
  price_sats: number;
}, btcUsd: number | null): string | null {
  if (offer.commission_type === "percentage" && offer.price_sats > 0) {
    return `≈ $${(offer.price_sats * offer.commission_rate).toFixed(2)} USD`;
  }
  if (offer.commission_type === "flat" && offer.commission_flat_sats > 0 && btcUsd) {
    return `≈ $${((offer.commission_flat_sats / 1e8) * btcUsd).toFixed(2)} USD`;
  }
  return null;
}

async function fetchBtcRate(): Promise<number | null> {
  try {
    const res = await fetch("https://coinpayportal.com/api/rates?coin=BTC", { next: { revalidate: 300 } });
    const d = await res.json();
    return d.success && d.rate ? d.rate : null;
  } catch { return null; }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

async function AffiliatesList({ searchParams }: { searchParams: AffiliatesPageProps["searchParams"] }) {
  const queryParams = await searchParams;
  const [supabase, btcUsd] = await Promise.all([createClient(), fetchBtcRate()]);

  let query = supabase
    .from("affiliate_offers" as any)
    .select(
      `
      *,
      profiles:seller_id (
        id,
        username,
        full_name,
        avatar_url
      )
    `,
      { count: "exact" }
    )
    .eq("status", "active");

  // Limit search param length to prevent oversized queries (#57)
  const searchTerm = queryParams.search?.slice(0, 200);
  if (searchTerm) {
    query = query.or(
      `title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
    );
  }

  if (queryParams.category) {
    query = query.eq("category", queryParams.category);
  }

  if (queryParams.tag) {
    query = query.contains("tags", [queryParams.tag]);
  }

  switch (queryParams.sort) {
    case "commission":
      query = query.order("commission_flat_sats", { ascending: false });
      break;
    case "popular":
      query = query.order("total_affiliates", { ascending: false });
      break;
    case "revenue":
      query = query.order("total_revenue_sats", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const page = parseInt(queryParams.page || "1");
  const limit = 20;
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: offers, count } = await query as any;

  if (!offers || offers.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {queryParams.category
            ? "No offers in this category yet."
            : queryParams.search || queryParams.tag
            ? "No affiliate offers found matching your criteria."
            : "No affiliate offers yet. Create the first one!"}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          {(queryParams.search || queryParams.category || queryParams.tag) && (
            <Link href="/affiliates" className="text-primary hover:underline">
              Clear filters
            </Link>
          )}
          <Link href="/affiliates/new">
            <Button size="sm">Create Offer</Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil((count || 0) / limit);

  const buildPaginationUrl = (newPage: number) => {
    const params = new URLSearchParams();
    if (queryParams.search) params.set("search", queryParams.search);
    if (queryParams.category) params.set("category", queryParams.category);
    if (queryParams.tag) params.set("tag", queryParams.tag);
    if (queryParams.sort && queryParams.sort !== "newest") params.set("sort", queryParams.sort);
    params.set("page", String(newPage));
    return `/affiliates?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {offers.length} of {count} offers
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {offers.map((offer: any) => {
          const profile = offer.profiles;
          return (
            <Link
              key={offer.id}
              href={`/affiliates/${offer.slug}`}
              className="group p-5 border border-border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-semibold text-base sm:text-lg group-hover:text-primary transition-colors line-clamp-1 min-w-0">
                  {offer.title}
                </h3>
                <Badge className="shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  {commissionDisplay(offer)}
                </Badge>
              </div>

              {commissionUsdHint(offer, btcUsd) && (
                <p className="text-[10px] text-muted-foreground -mt-2 mb-2 text-right">
                  {commissionUsdHint(offer, btcUsd)}
                </p>
              )}

              {offer.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2 whitespace-pre-wrap break-words">
                  {offer.description}
                </p>
              )}

              {offer.tags && offer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {offer.tags.slice(0, 4).map((tag: string) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  {offer.tags.length > 4 && (
                    <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                      +{offer.tags.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* product_url domain hint removed — URL is hidden from public listing (#20) */}

              <div className="flex flex-wrap items-center justify-between gap-y-1 text-xs text-muted-foreground mt-auto pt-2 border-t border-border/50">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  {profile?.username && (
                    <span className="flex items-center gap-1">
                      <Avatar className="h-4 w-4">
                        {profile.avatar_url ? (
                          <AvatarImage src={profile.avatar_url} alt={profile.username} />
                        ) : null}
                        <AvatarFallback className="text-[8px]">
                          {(profile.full_name || profile.username)?.[0]?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      {profile.username}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span>{offer.cookie_days}d cookie</span>
                  <span className="flex items-center gap-0.5">
                    <Users className="h-3 w-3" />
                    {offer.total_affiliates}
                  </span>
                  <span>{formatRelativeTime(offer.created_at)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link href={buildPaginationUrl(page - 1)}>
              <Button variant="outline">Previous</Button>
            </Link>
          )}
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildPaginationUrl(page + 1)}>
              <Button variant="outline">Next</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function AffiliatesListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-6 border border-border rounded-lg">
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-4" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AffiliateFilters({
  search,
  category,
  tag,
  sort,
}: {
  search?: string;
  category?: string;
  tag?: string;
  sort?: string;
}) {
  const currentSort = sort || "newest";
  // Don't persist search in category/sort filter links (#58)
  const base = {
    ...(tag ? { tag } : {}),
  };

  const sortOptions = [
    { value: "newest", label: "Newest" },
    { value: "commission", label: "Highest Commission" },
    { value: "popular", label: "Most Affiliates" },
    { value: "revenue", label: "Top Revenue" },
  ];

  return (
    <div className="flex flex-wrap gap-3 overflow-x-auto">
      {tag && (
        <div className="w-full flex items-center gap-2 text-sm text-muted-foreground">
          Filtered by tag: <Badge variant="secondary">{tag}</Badge>
          <Link href={`/affiliates?${new URLSearchParams({ ...(search ? { search } : {}), ...(category ? { category } : {}), ...(sort ? { sort } : {}) }).toString()}`} className="text-primary hover:underline text-xs">
            Clear
          </Link>
        </div>
      )}
      <form action="/affiliates" method="GET" className="flex gap-2 flex-1 min-w-[200px]">
        <input
          type="text"
          name="search"
          placeholder="Search offers..."
          defaultValue={search}
          maxLength={200}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {category && <input type="hidden" name="category" value={category} />}
        {tag && <input type="hidden" name="tag" value={tag} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        <Button type="submit" variant="outline">Search</Button>
      </form>

      <div className="flex gap-2 flex-wrap">
        <Link href={`/affiliates?${new URLSearchParams({ ...base, ...(sort ? { sort } : {}) }).toString()}`}>
          <Button variant={!category ? "default" : "outline"} size="sm">All</Button>
        </Link>
        {SKILL_CATEGORIES.slice(0, 6).map((cat) => (
          <Link
            key={cat}
            href={`/affiliates?${new URLSearchParams({ ...base, category: cat, ...(sort ? { sort } : {}) }).toString()}`}
          >
            <Button variant={category === cat ? "default" : "outline"} size="sm">
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          </Link>
        ))}
      </div>

      <div className="flex gap-1">
        {sortOptions.map((opt) => (
          <Link
            key={opt.value}
            href={`/affiliates?${new URLSearchParams({ ...base, sort: opt.value, ...(category ? { category } : {}) }).toString()}`}
          >
            <Button variant={currentSort === opt.value ? "default" : "ghost"} size="sm" className="text-xs">
              {opt.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function AffiliatesPage({ searchParams }: AffiliatesPageProps) {
  const queryParams = await searchParams;

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold">Affiliate Marketplace</h1>
            <div className="flex gap-2 shrink-0">
              <Link href="/dashboard/affiliates">
                <Button variant="outline" size="sm">My Dashboard</Button>
              </Link>
              <Link href="/affiliates/new">
                <Button size="sm">Create Offer</Button>
              </Link>
            </div>
          </div>
          <p className="text-muted-foreground mb-8">
            Promote products and earn commissions in sats
          </p>

          <AffiliateFilters
            search={queryParams.search}
            category={queryParams.category}
            tag={queryParams.tag}
            sort={queryParams.sort}
          />

          <div className="mt-8">
            <Suspense fallback={<AffiliatesListSkeleton />}>
              <AffiliatesList searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
