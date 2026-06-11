import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CandidateFilters } from "@/components/candidates/CandidateFilters";
import { CandidateLoadMore } from "@/components/candidates/CandidateLoadMore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { buildDirectoryUrl } from "@/lib/directory-url";
import { Users } from "lucide-react";

interface CandidatesPageProps {
  params: Promise<{ tags?: string[] }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
    available?: string;
  }>;
}

export async function generateMetadata({ params }: CandidatesPageProps): Promise<Metadata> {
  const { tags } = await params;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  if (tagList.length > 0) {
    const title = `${tagList.join(", ")} Candidates | ugig.net`;
    const description = `Browse AI-assisted candidates with ${tagList.join(", ")} skills and hire professionals who already work effectively with modern AI tools.`;
    const slug = tagList.map(encodeURIComponent).join(",");
    return {
      title,
      description,
      alternates: { canonical: `/candidates/${slug}` },
      openGraph: { title, description, url: `/candidates/${slug}`, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  const title = "Browse Candidates | ugig.net";
  const description = "Find AI-assisted candidates, freelancers, and operators for your next project on ugig.net.";
  return {
    title,
    description,
    alternates: { canonical: "/candidates" },
    openGraph: { title, description, url: "/candidates", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function CandidatesList({
  params,
  searchParams,
}: {
  params: CandidatesPageProps["params"];
  searchParams: CandidatesPageProps["searchParams"];
}) {
  const { tags } = await params;
  const queryParams = await searchParams;
  const supabase = await createClient();

  // Parse tags from URL (comma-separated)
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  // Build query — show human profiles only (exclude agents + spam)
  const { buildCandidatesQuery } = await import("@/lib/queries/candidates");
  const query = buildCandidatesQuery(supabase, {
    q: queryParams.q,
    sort: queryParams.sort,
    page: queryParams.page,
    available: queryParams.available,
    tags: tagList,
  });

  const { data: candidates, count } = await query;

  // Build fetch URL for Load More
  const fetchParams = new URLSearchParams();
  if (queryParams.q) fetchParams.set("q", queryParams.q);
  if (queryParams.sort) fetchParams.set("sort", queryParams.sort);
  if (queryParams.available) fetchParams.set("available", queryParams.available);
  if (tagList.length > 0) fetchParams.set("tags", tagList.join(","));
  const fetchUrl = `/api/candidates?${fetchParams.toString()}`;

  if (!candidates || candidates.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {tagList.length > 0
            ? "No candidates found matching your criteria."
            : "No candidates have signed up yet. Join and be the first!"}
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          {tagList.length > 0 && (
            <Link href="/candidates" className="text-primary hover:underline">
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
    <CandidateLoadMore
      initialItems={candidates}
      totalCount={count || 0}
      pageSize={20}
      fetchUrl={fetchUrl}
      highlightTags={tagList}
    />
  );
}

function CandidatesListSkeleton() {
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

export default async function CandidatesPage({ params, searchParams }: CandidatesPageProps) {
  const { tags } = await params;
  const queryParams = await searchParams;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Browse Candidates</h1>
          <p className="text-muted-foreground mb-8">
            Find AI-powered professionals for your next project
          </p>

          <Suspense fallback={<div className="h-48" />}>
            <CandidateFilters activeTags={tagList} search={queryParams.q} />
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
            <Suspense fallback={<CandidatesListSkeleton />}>
              <CandidatesList params={params} searchParams={searchParams} />
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
    buildDirectoryUrl({ path: "/candidates", tags, search, sort, available });

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
    return `/candidates${tagPath}${queryString ? `?${queryString}` : ""}`;
  };

  return (
    <Link href={buildUrl(!isAvailable)}>
      <Button variant={isAvailable ? "default" : "outline"} size="sm">
        {isAvailable ? "Available only" : "Show all"}
      </Button>
    </Link>
  );
}
