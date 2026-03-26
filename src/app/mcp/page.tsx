import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Server, Star, Download, Zap } from "lucide-react";
import { MCP_CATEGORIES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "MCP Server Marketplace | ugig.net",
  description:
    "Browse MCP servers — tools, integrations, and APIs that AI agents can connect to via the Model Context Protocol.",
  alternates: {
    canonical: "/mcp",
  },
  openGraph: {
    title: "MCP Server Marketplace | ugig.net",
    description:
      "Browse MCP servers — tools, integrations, and APIs that AI agents can connect to via the Model Context Protocol.",
    url: "/mcp",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MCP Server Marketplace | ugig.net",
    description:
      "Browse MCP servers — tools, integrations, and APIs that AI agents can connect to via the Model Context Protocol.",
  },
};

interface McpPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    tag?: string;
    sort?: string;
    page?: string;
  }>;
}

async function fetchBtcRate(): Promise<number | null> {
  try {
    const res = await fetch("https://coinpayportal.com/api/rates?coin=BTC", { next: { revalidate: 300 } });
    const d = await res.json();
    return d.success && d.rate ? d.rate : null;
  } catch { return null; }
}

async function McpList({ searchParams }: { searchParams: McpPageProps["searchParams"] }) {
  const queryParams = await searchParams;
  const [supabase, btcUsd] = await Promise.all([createClient(), fetchBtcRate()]);

  const page = parseInt(queryParams.page || "1");
  const limit = 21;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("mcp_listings" as any)
    .select(
      `*, seller:profiles!seller_id (id, username, full_name, avatar_url, account_type, verified)`,
      { count: "exact" }
    )
    .eq("status", "active");

  if (queryParams.search) {
    query = query.or(
      `title.ilike.%${queryParams.search}%,description.ilike.%${queryParams.search}%,tagline.ilike.%${queryParams.search}%`
    );
  }

  if (queryParams.category) {
    query = query.eq("category", queryParams.category);
  }

  if (queryParams.tag) {
    query = query.contains("tags", [queryParams.tag]);
  }

  switch (queryParams.sort) {
    case "popular":
      query = query.order("downloads_count", { ascending: false });
      break;
    case "rating":
      query = query.order("rating_avg", { ascending: false });
      break;
    case "price_low":
      query = query.order("price_sats", { ascending: true });
      break;
    case "price_high":
      query = query.order("price_sats", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);
  const { data: listings, count } = await query;

  if (!listings || listings.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {queryParams.search || queryParams.category || queryParams.tag
            ? "No MCP servers found matching your criteria."
            : "No MCP servers listed yet. Be the first to publish one!"}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          {(queryParams.search || queryParams.category || queryParams.tag) && (
            <Link href="/mcp" className="text-primary hover:underline">
              Clear filters
            </Link>
          )}
          <Link href="/dashboard/mcp/new">
            <Button size="sm">Publish an MCP Server</Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil((count || 0) / limit);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {listings.length} of {count} MCP servers
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(listings as any[]).map((listing) => (
          <Link
            key={listing.id}
            href={`/mcp/${listing.slug}`}
            className="group p-5 border border-border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-1">
                {listing.title}
              </h3>
              {listing.price_sats === 0 ? (
                <Badge variant="secondary" className="shrink-0 ml-2">
                  Free
                </Badge>
              ) : (
                <div className="shrink-0 ml-2 text-right">
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                    <Zap className="h-3 w-3 mr-1" />
                    {listing.price_sats.toLocaleString()}
                  </Badge>
                  {btcUsd && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      ≈ ${((listing.price_sats / 1e8) * btcUsd).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {listing.tagline && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {listing.tagline}
              </p>
            )}

            {listing.scan_status && listing.scan_status !== "unscanned" && (
              <div className="mb-3">
                <Badge
                  variant={listing.scan_status === "critical" ? "destructive" : listing.scan_status === "clean" ? "default" : "secondary"}
                  className="text-[11px]"
                >
                  Security {listing.scan_rating ? `(${listing.scan_rating})` : ""}: {listing.scan_status}
                </Badge>
              </div>
            )}

            {/* Transport type badge */}
            {listing.transport_type && (
              <div className="mb-3">
                <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full">
                  {listing.transport_type}
                </span>
              </div>
            )}

            {listing.tags && listing.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {listing.tags.slice(0, 4).map((tag: string) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
                {listing.tags.length > 4 && (
                  <span className="text-xs text-muted-foreground">
                    +{listing.tags.length - 4}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  {listing.seller?.avatar_url && (
                    <AvatarImage src={listing.seller.avatar_url} />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {(listing.seller?.username || "?")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{listing.seller?.username}</span>
              </div>
              <div className="flex items-center gap-3">
                {listing.rating_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    {Number(listing.rating_avg).toFixed(1)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Download className="h-3.5 w-3.5" />
                  {listing.downloads_count}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/mcp?${new URLSearchParams({
                ...(queryParams.search ? { search: queryParams.search } : {}),
                ...(queryParams.category ? { category: queryParams.category } : {}),
                ...(queryParams.tag ? { tag: queryParams.tag } : {}),
                ...(queryParams.sort ? { sort: queryParams.sort } : {}),
                page: String(page - 1),
              })}`}
            >
              <Button variant="outline">Previous</Button>
            </Link>
          )}
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/mcp?${new URLSearchParams({
                ...(queryParams.search ? { search: queryParams.search } : {}),
                ...(queryParams.category ? { category: queryParams.category } : {}),
                ...(queryParams.tag ? { tag: queryParams.tag } : {}),
                ...(queryParams.sort ? { sort: queryParams.sort } : {}),
                page: String(page + 1),
              })}`}
            >
              <Button variant="outline">Next</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function McpListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="p-5 border border-border rounded-lg">
          <Skeleton className="h-6 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-3" />
          <div className="flex gap-2 mb-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function McpPage({ searchParams }: McpPageProps) {
  const queryParams = await searchParams;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">MCP Server Marketplace</h1>
            <Link href="/dashboard/mcp/new">
              <Button size="sm">
                <Server className="h-4 w-4 mr-2" />
                Publish MCP Server
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground mb-8">
            Browse MCP servers — tools, integrations, and APIs for AI agents.
          </p>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6">
            {/* Search */}
            <form method="GET" action="/mcp" className="flex gap-2">
              <input
                type="text"
                name="search"
                placeholder="Search MCP servers..."
                defaultValue={queryParams.search || ""}
                className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {queryParams.category && (
                <input type="hidden" name="category" value={queryParams.category} />
              )}
              {queryParams.tag && (
                <input type="hidden" name="tag" value={queryParams.tag} />
              )}
              {queryParams.sort && (
                <input type="hidden" name="sort" value={queryParams.sort} />
              )}
              <Button type="submit" variant="outline" size="sm">
                Search
              </Button>
            </form>

            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5">
              <Link href={`/mcp?${queryParams.search ? `search=${queryParams.search}&` : ""}${queryParams.tag ? `tag=${queryParams.tag}&` : ""}${queryParams.sort ? `sort=${queryParams.sort}` : ""}`}>
                <Badge
                  variant={!queryParams.category ? "default" : "outline"}
                  className="cursor-pointer"
                >
                  All
                </Badge>
              </Link>
              {MCP_CATEGORIES.map((cat) => (
                <Link
                  key={cat}
                  href={`/mcp?category=${cat}${queryParams.search ? `&search=${queryParams.search}` : ""}${queryParams.tag ? `&tag=${queryParams.tag}` : ""}${queryParams.sort ? `&sort=${queryParams.sort}` : ""}`}
                >
                  <Badge
                    variant={queryParams.category === cat ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                  >
                    {cat.replace("-", " ")}
                  </Badge>
                </Link>
              ))}
            </div>

            {/* Sort */}
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sort:</span>
              {[
                { value: "newest", label: "Newest" },
                { value: "popular", label: "Popular" },
                { value: "rating", label: "Top Rated" },
              ].map(({ value, label }) => (
                <Link
                  key={value}
                  href={`/mcp?sort=${value}${queryParams.search ? `&search=${queryParams.search}` : ""}${queryParams.category ? `&category=${queryParams.category}` : ""}${queryParams.tag ? `&tag=${queryParams.tag}` : ""}`}
                  className={`hover:text-primary transition-colors ${
                    (queryParams.sort || "newest") === value
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Active tag filter */}
          {queryParams.tag && (
            <div className="flex items-center gap-2 mb-6">
              <span className="text-sm text-muted-foreground">Filtered by tag:</span>
              <Badge variant="secondary" className="gap-1">
                {queryParams.tag}
                <Link href={`/mcp?${new URLSearchParams({
                  ...(queryParams.search ? { search: queryParams.search } : {}),
                  ...(queryParams.category ? { category: queryParams.category } : {}),
                  ...(queryParams.sort ? { sort: queryParams.sort } : {}),
                })}`} className="ml-1 hover:text-destructive">
                  ✕
                </Link>
              </Badge>
            </div>
          )}

          <Suspense fallback={<McpListSkeleton />}>
            <McpList searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
