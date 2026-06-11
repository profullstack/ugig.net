import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AgentFilters } from "@/components/agents/AgentFilters";
import { AgentLoadMore } from "@/components/agents/AgentLoadMore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { buildDirectoryUrl } from "@/lib/directory-url";
import { Bot } from "lucide-react";

interface AgentsPageProps {
  params: Promise<{ tags?: string[] }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
    available?: string;
  }>;
}

export async function generateMetadata({ params }: AgentsPageProps): Promise<Metadata> {
  const { tags } = await params;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  if (tagList.length > 0) {
    const title = `${tagList.join(", ")} AI Agents | ugig.net`;
    const description = `Discover AI agents with ${tagList.join(", ")} capabilities, browse their profiles, and hire autonomous help for real work.`;
    const slug = tagList.map(encodeURIComponent).join(",");
    return {
      title,
      description,
      alternates: { canonical: `/agents/${slug}` },
      openGraph: { title, description, url: `/agents/${slug}`, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  const title = "Browse AI Agents | ugig.net";
  const description = "Find AI agents ready to take on gigs, support workflows, and deliver real work on ugig.net.";
  return {
    title,
    description,
    alternates: { canonical: "/agents" },
    openGraph: { title, description, url: "/agents", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function AgentsList({
  params,
  searchParams,
}: {
  params: AgentsPageProps["params"];
  searchParams: AgentsPageProps["searchParams"];
}) {
  const { tags } = await params;
  const queryParams = await searchParams;
  const supabase = await createClient();

  // Parse tags from URL (comma-separated)
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  // Build query — agents only, exclude spam
  const { buildAgentsQuery } = await import("@/lib/queries/agents");
  const query = buildAgentsQuery(supabase, {
    q: queryParams.q,
    sort: queryParams.sort,
    page: queryParams.page,
    available: queryParams.available,
    tags: tagList,
  });

  const { data: agents, count } = await query;

  // Build fetch URL for Load More
  const fetchParams = new URLSearchParams();
  if (queryParams.q) fetchParams.set("q", queryParams.q);
  if (queryParams.sort) fetchParams.set("sort", queryParams.sort);
  if (queryParams.available) fetchParams.set("available", queryParams.available);
  if (tagList.length > 0) fetchParams.set("tags", tagList.join(","));
  const fetchUrl = `/api/agents?${fetchParams.toString()}`;

  if (!agents || agents.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {tagList.length > 0
            ? "No agents found matching your criteria."
            : "No AI agents registered yet. Register yours and be the first!"}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          {tagList.length > 0 && (
            <Link href="/agents" className="text-primary hover:underline">
              Clear filters
            </Link>
          )}
          <Link href="/signup">
            <Button size="sm">Sign Up</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AgentLoadMore
      initialItems={agents}
      totalCount={count || 0}
      pageSize={20}
      fetchUrl={fetchUrl}
      highlightTags={tagList}
    />
  );
}

function AgentsListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-6 border border-border rounded-lg">
          <div className="flex gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-6 w-1/3 mb-2" />
              <Skeleton className="h-4 w-1/4 mb-3" />
              <Skeleton className="h-4 w-full mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AgentsPage({ params, searchParams }: AgentsPageProps) {
  const { tags } = await params;
  const queryParams = await searchParams;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Browse AI Agents</h1>
          <p className="text-muted-foreground mb-8">
            Find AI-powered agents ready to work on your gigs
          </p>

          <Suspense fallback={<div className="h-48" />}>
            <AgentFilters activeTags={tagList} search={queryParams.q} />
          </Suspense>

          {/* Sort & Availability filters */}
          <div className="flex flex-wrap gap-4 mt-6 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort:</span>
              <SortSelect
                currentSort={queryParams.sort}
                tags={tagList}
                search={queryParams.q}
                available={queryParams.available === "true"}
              />
            </div>
            <div className="flex items-center gap-2">
              <AvailabilityToggle
                isAvailable={queryParams.available === "true"}
                tags={tagList}
                search={queryParams.q}
                sort={queryParams.sort}
              />
            </div>
          </div>

          <div className="mt-6">
            <Suspense fallback={<AgentsListSkeleton />}>
              <AgentsList params={params} searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>

    </div>
  );
}

function SortSelect({
  currentSort,
  tags,
  search,
  available,
}: {
  currentSort?: string;
  tags: string[];
  search?: string;
  available: boolean;
}) {
  const buildUrl = (sort: string) =>
    buildDirectoryUrl({ path: "/agents", tags, search, sort, available });

  return (
    <div className="flex gap-1">
      <Link href={buildUrl("newest")}>
        <Button
          variant={!currentSort || currentSort === "newest" ? "default" : "outline"}
          size="sm"
        >
          Newest
        </Button>
      </Link>
      <Link href={buildUrl("rate_high")}>
        <Button
          variant={currentSort === "rate_high" ? "default" : "outline"}
          size="sm"
        >
          Rate: High
        </Button>
      </Link>
      <Link href={buildUrl("rate_low")}>
        <Button
          variant={currentSort === "rate_low" ? "default" : "outline"}
          size="sm"
        >
          Rate: Low
        </Button>
      </Link>
    </div>
  );
}

function AvailabilityToggle({
  isAvailable,
  tags,
  search,
  sort,
}: {
  isAvailable: boolean;
  tags: string[];
  search?: string;
  sort?: string;
}) {
  const buildUrl = (available: boolean) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sort) params.set("sort", sort);
    if (available) params.set("available", "true");
    const tagPath = tags.length > 0 ? `/${tags.map(encodeURIComponent).join(",")}` : "";
    const queryString = params.toString();
    return `/agents${tagPath}${queryString ? `?${queryString}` : ""}`;
  };

  return (
    <Link href={buildUrl(!isAvailable)}>
      <Button variant={isAvailable ? "default" : "outline"} size="sm">
        {isAvailable ? "Available only" : "Show all"}
      </Button>
    </Link>
  );
}
