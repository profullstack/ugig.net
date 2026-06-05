import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FolderOpen, ExternalLink, Zap, ThumbsUp, MessageSquare } from "lucide-react";
import { parsePageParam } from "@/lib/pagination";
import { escapePostgrestSearchValue } from "@/lib/security/sanitize";

export const metadata: Metadata = {
  title: "Project Directory | ugig.net",
  description:
    "Discover projects built by the ugig.net community. List your project for 50 sats.",
  alternates: { canonical: "/directory" },
  openGraph: {
    title: "Project Directory | ugig.net",
    description:
      "Discover projects built by the ugig.net community. List your project for 50 sats.",
    url: "/directory",
    type: "website",
  },
};

interface DirectoryPageProps {
  searchParams: Promise<{
    search?: string;
    tag?: string;
    page?: string;
  }>;
}

async function DirectoryList({
  searchParams,
}: {
  searchParams: DirectoryPageProps["searchParams"];
}) {
  const queryParams = await searchParams;
  const supabase = await createClient();

  const page = parsePageParam(queryParams.page);
  const limit = 21;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("project_listings" as any)
    .select(
      `*, user:profiles!user_id (id, username, full_name, avatar_url)`,
      { count: "exact" }
    )
    .eq("status", "active");

  if (queryParams.search) {
    const safeSearch = escapePostgrestSearchValue(queryParams.search);
    query = query.or(
      `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`
    );
  }

  if (queryParams.tag) {
    query = query.contains("tags", [queryParams.tag]);
  }

  query = query.order("created_at", { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data: listings, count } = await query;

  if (!listings || listings.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {queryParams.search || queryParams.tag
            ? "No projects found matching your criteria."
            : "No projects listed yet. Be the first!"}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          {(queryParams.search || queryParams.tag) && (
            <Link href="/directory" className="text-primary hover:underline">
              Clear filters
            </Link>
          )}
          <Link href="/directory/new">
            <Button size="sm">
              <Zap className="h-4 w-4 mr-1" />
              List Your Project — 50 ⚡
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil((count || 0) / limit);

  // Collect all unique tags for filter pills
  const allTags = Array.from(
    new Set((listings as any[]).flatMap((l) => l.tags || []))
  ).slice(0, 20);

  return (
    <div className="space-y-6">
      {/* Tag filter pills */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {queryParams.tag && (
            <Link href={`/directory?${queryParams.search ? `search=${queryParams.search}` : ""}`}>
              <Badge variant="outline" className="cursor-pointer">
                Clear tag
              </Badge>
            </Link>
          )}
          {allTags.map((tag) => (
            <Link
              key={tag}
              href={`/directory?tag=${tag}${queryParams.search ? `&search=${queryParams.search}` : ""}`}
            >
              <Badge
                variant={queryParams.tag === tag ? "default" : "outline"}
                className="cursor-pointer"
              >
                {tag}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Showing {listings.length} of {count} projects
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(listings as any[]).map((listing) => (
          <Link
            key={listing.id}
            href={`/directory/${listing.id}`}
            className="group border border-border rounded-lg bg-card hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden"
          >
            {/* Card header image: banner or screenshot */}
            {(listing.banner_url || listing.screenshot_url) && (
              <img
                src={listing.banner_url || listing.screenshot_url}
                alt=""
                className="w-full h-32 object-cover"
              />
            )}

            <div className="p-5">
            <div className="flex items-start gap-3 mb-3">
              {listing.logo_url && (
                <img
                  src={listing.logo_url}
                  alt=""
                  className="w-48 h-auto rounded-lg object-contain shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-1">
                  {listing.title}
                </h3>
                <span className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {listing.url.replace(/^https?:\/\//, "")}
                </span>
              </div>
            </div>

            {listing.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {listing.description}
              </p>
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
                  {listing.user?.avatar_url && (
                    <AvatarImage src={listing.user.avatar_url} />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {(listing.user?.username || "?")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{listing.user?.username}</span>
              </div>
              <div className="flex items-center gap-3">
                {(listing.score != null && listing.score !== 0) && (
                  <span className={`flex items-center gap-0.5 ${listing.score > 0 ? "text-green-500" : listing.score < 0 ? "text-red-500" : ""}`}>
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {listing.score}
                  </span>
                )}
                {(listing.comments_count != null && listing.comments_count > 0) && (
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {listing.comments_count}
                  </span>
                )}
              </div>
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
              href={`/directory?${new URLSearchParams({
                ...(queryParams.search ? { search: queryParams.search } : {}),
                ...(queryParams.tag ? { tag: queryParams.tag } : {}),
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
              href={`/directory?${new URLSearchParams({
                ...(queryParams.search ? { search: queryParams.search } : {}),
                ...(queryParams.tag ? { tag: queryParams.tag } : {}),
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

function DirectoryListSkeleton() {
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
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DirectoryPage({
  searchParams,
}: DirectoryPageProps) {
  const queryParams = await searchParams;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Project Directory</h1>
            <Link href="/directory/new">
              <Button size="sm">
                <Zap className="h-4 w-4 mr-1" />
                List Your Project — 50 ⚡
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground mb-8">
            Discover projects built by the community. List yours for 50 ⚡
            sats.
          </p>

          {/* Search */}
          <div className="flex flex-wrap gap-3 mb-6">
            <form method="GET" action="/directory" className="flex gap-2">
              <input
                type="text"
                name="search"
                placeholder="Search projects..."
                defaultValue={queryParams.search || ""}
                className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {queryParams.tag && (
                <input type="hidden" name="tag" value={queryParams.tag} />
              )}
              <Button type="submit" variant="outline" size="sm">
                Search
              </Button>
            </form>
          </div>

          {/* Active tag filter */}
          {queryParams.tag && (
            <div className="flex items-center gap-2 mb-6">
              <span className="text-sm text-muted-foreground">
                Filtered by tag:
              </span>
              <Badge variant="secondary" className="gap-1">
                {queryParams.tag}
                <Link
                  href={`/directory?${new URLSearchParams({
                    ...(queryParams.search
                      ? { search: queryParams.search }
                      : {}),
                  })}`}
                  className="ml-1 hover:text-destructive"
                >
                  ✕
                </Link>
              </Badge>
            </div>
          )}

          <Suspense fallback={<DirectoryListSkeleton />}>
            <DirectoryList searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
