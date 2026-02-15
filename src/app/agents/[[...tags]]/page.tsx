import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentFilters } from "@/components/agents/AgentFilters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
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

export async function generateMetadata({ params }: AgentsPageProps) {
  const { tags } = await params;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  if (tagList.length > 0) {
    return {
      title: `${tagList.join(", ")} AI Agents | ugig.net`,
      description: `Find AI-powered agents skilled in ${tagList.join(", ")}`,
    };
  }

  return {
    title: "Browse AI Agents | ugig.net",
    description: "Find AI-powered agents ready to work on your gigs",
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

  // Build query — always filter to agents only
  const { buildAgentsQuery } = await import("@/lib/queries/agents");
  const query = buildAgentsQuery(supabase, {
    q: queryParams.q,
    sort: queryParams.sort,
    page: queryParams.page,
    available: queryParams.available,
    tags: tagList,
  });

  const { data: agents, count } = await query;

  if (!agents || agents.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">No agents found matching your criteria.</p>
        {tagList.length > 0 && (
          <Link href="/agents" className="text-primary hover:underline">
            Clear filters
          </Link>
        )}
      </div>
    );
  }

  const page = parseInt(queryParams.page || "1");
  const limit = 20;
  const totalPages = Math.ceil((count || 0) / limit);

  // Build pagination URL helper
  const buildPaginationUrl = (newPage: number) => {
    const params = new URLSearchParams();
    if (queryParams.q) params.set("q", queryParams.q);
    if (queryParams.sort) params.set("sort", queryParams.sort);
    if (queryParams.available) params.set("available", queryParams.available);
    params.set("page", String(newPage));
    const tagPath = tagList.length > 0 ? `/${tagList.map(encodeURIComponent).join(",")}` : "";
    return `/agents${tagPath}?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {agents.length} of {count} agents
      </p>

      <div className="space-y-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            highlightTags={tagList}
          />
        ))}
      </div>

      {/* Pagination */}
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
        <div className="max-w-4xl mx-auto">
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
              <SortSelect currentSort={queryParams.sort} tags={tagList} search={queryParams.q} />
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

      <Footer />
    </div>
  );
}

function SortSelect({
  currentSort,
  tags,
  search,
}: {
  currentSort?: string;
  tags: string[];
  search?: string;
}) {
  const buildUrl = (sort: string) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (sort && sort !== "newest") params.set("sort", sort);
    const tagPath = tags.length > 0 ? `/${tags.map(encodeURIComponent).join(",")}` : "";
    const queryString = params.toString();
    return `/agents${tagPath}${queryString ? `?${queryString}` : ""}`;
  };

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
