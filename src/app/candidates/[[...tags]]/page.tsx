import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CandidateCard } from "@/components/candidates/CandidateCard";
import { CandidateFilters } from "@/components/candidates/CandidateFilters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Users } from "lucide-react";

interface CandidatesPageProps {
  params: Promise<{ tags?: string[] }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
    available?: string;
    account_type?: string;
  }>;
}

export async function generateMetadata({ params }: CandidatesPageProps) {
  const { tags } = await params;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  if (tagList.length > 0) {
    return {
      title: `${tagList.join(", ")} Candidates | ugig.net`,
      description: `Find AI-powered professionals skilled in ${tagList.join(", ")}`,
    };
  }

  return {
    title: "Browse Candidates | ugig.net",
    description: "Find AI-powered professionals for your next project",
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

  // Build query — show all profiles (filter by completion status if needed)
  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" });

  // Filter by search query
  if (queryParams.q) {
    query = query.or(
      `full_name.ilike.%${queryParams.q}%,username.ilike.%${queryParams.q}%,bio.ilike.%${queryParams.q}%`
    );
  }

  // Filter by availability
  if (queryParams.available === "true") {
    query = query.eq("is_available", true);
  }

  // Filter by account type
  if (queryParams.account_type === "human" || queryParams.account_type === "agent") {
    query = query.eq("account_type", queryParams.account_type);
  }

  // Filter by tags (skills or ai_tools)
  // We need to filter profiles that have ANY of the tags in their skills OR ai_tools
  for (const tag of tagList) {
    // Use case-insensitive array contains
    query = query.or(`skills.cs.{"${tag}"},ai_tools.cs.{"${tag}"}`);
  }

  // Apply sorting
  switch (queryParams.sort) {
    case "rate_high":
      query = query.order("hourly_rate", { ascending: false, nullsFirst: false });
      break;
    case "rate_low":
      query = query.order("hourly_rate", { ascending: true, nullsFirst: false });
      break;
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  // Pagination
  const page = parseInt(queryParams.page || "1");
  const limit = 20;
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: candidates, count } = await query;

  if (!candidates || candidates.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">No candidates found matching your criteria.</p>
        {tagList.length > 0 && (
          <Link href="/candidates" className="text-primary hover:underline">
            Clear filters
          </Link>
        )}
      </div>
    );
  }

  const totalPages = Math.ceil((count || 0) / limit);

  // Build pagination URL helper
  const buildPaginationUrl = (newPage: number) => {
    const params = new URLSearchParams();
    if (queryParams.q) params.set("q", queryParams.q);
    if (queryParams.sort) params.set("sort", queryParams.sort);
    if (queryParams.available) params.set("available", queryParams.available);
    if (queryParams.account_type) params.set("account_type", queryParams.account_type);
    params.set("page", String(newPage));
    const tagPath = tagList.length > 0 ? `/${tagList.map(encodeURIComponent).join(",")}` : "";
    return `/candidates${tagPath}?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {candidates.length} of {count} candidates
      </p>

      <div className="space-y-4">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
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
        <div className="max-w-4xl mx-auto">
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
            <Suspense fallback={<CandidatesListSkeleton />}>
              <CandidatesList params={params} searchParams={searchParams} />
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
    return `/candidates${tagPath}${queryString ? `?${queryString}` : ""}`;
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
