import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GigCard } from "@/components/gigs/GigCard";
import { GigFiltersWithTags } from "@/components/gigs/GigFiltersWithTags";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { AdUnit } from "@/components/AdUnit";
import { hasActiveGigFilters } from "@/lib/gigs/filter-state";
import { parsePageParam } from "@/lib/pagination";
import { fetchGigs } from "@/lib/gigs/fetch-gigs";
import { MICRO_BUDGET_USD, wantsMicroBudgets } from "@/lib/gigs/micro-budget";
import { getSessionBlockedIds } from "@/lib/blocks";
import type { GigCardData } from "@/components/gigs/GigCard";
import { Briefcase } from "lucide-react";

interface GigsPageProps {
  params: Promise<{ tags?: string[] }>;
  searchParams: Promise<{
    search?: string;
    category?: string;
    location_type?: string;
    budget_type?: string;
    sort?: string;
    page?: string;
    skill?: string;
    include_micro?: string;
  }>;
}

export async function generateMetadata({ params }: GigsPageProps): Promise<Metadata> {
  const { tags } = await params;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  if (tagList.length > 0) {
    const title = `${tagList.join(", ")} Gigs | ugig.net`;
    const description = `Browse gigs looking for ${tagList.join(", ")} skills and connect with employers hiring AI-assisted talent on ugig.net.`;
    const slug = tagList.map(encodeURIComponent).join(",");
    return {
      title,
      description,
      alternates: { canonical: `/gigs/${slug}` },
      openGraph: { title, description, url: `/gigs/${slug}`, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  }

  const title = "Browse Gigs | ugig.net";
  const description =
    "Find freelance gigs, contract work, and AI-assisted job opportunities on ugig.net.";
  return {
    title,
    description,
    alternates: { canonical: "/gigs" },
    openGraph: { title, description, url: "/gigs", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function GigsList({
  params,
  searchParams,
}: {
  params: GigsPageProps["params"];
  searchParams: GigsPageProps["searchParams"];
}) {
  const { tags } = await params;
  const queryParams = await searchParams;
  const supabase = await createClient();

  // Parse tags from URL (comma-separated) or ?skill= query param
  const tagList = queryParams.skill
    ? queryParams.skill.split(",").map(decodeURIComponent)
    : tags?.[0]?.split(",").map(decodeURIComponent) || [];

  // Pagination
  const page = parsePageParam(queryParams.page);
  const limit = 20;

  // A blocked user must not appear in the listing at all.
  const blockedIds = await getSessionBlockedIds(supabase);

  // Sub-$5 gigs are left out of the default view, one click brings them back.
  const includeMicro = wantsMicroBudgets(queryParams.include_micro);

  const { gigs, count, hiddenMicro } = await fetchGigs(supabase, {
    listingType: "hiring",
    filters: {
      search: queryParams.search,
      category: queryParams.category,
      locationType: queryParams.location_type,
      budgetType: queryParams.budget_type,
      tags: tagList,
    },
    sort: queryParams.sort,
    page,
    limit,
    excludeUserIds: blockedIds,
    hideMicroBudgets: !includeMicro,
  });
  const hasActiveFilters = hasActiveGigFilters(queryParams, tagList);

  const microToggleUrl = (show: boolean) => {
    const params = new URLSearchParams();
    if (queryParams.search) params.set("search", queryParams.search);
    if (queryParams.category) params.set("category", queryParams.category);
    if (queryParams.location_type) params.set("location_type", queryParams.location_type);
    if (queryParams.budget_type) params.set("budget_type", queryParams.budget_type);
    if (queryParams.sort && queryParams.sort !== "newest") params.set("sort", queryParams.sort);
    if (show) params.set("include_micro", "1");
    const tagPath = tagList.length > 0 ? `/${tagList.map(encodeURIComponent).join(",")}` : "";
    const qs = params.toString();
    return `/gigs${tagPath}${qs ? `?${qs}` : ""}`;
  };


  if (!gigs || gigs.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {hasActiveFilters
            ? "No gigs found matching your criteria."
            : "No gigs posted yet. Be the first to post one!"}
        </p>
        {hiddenMicro > 0 && (
          <p className="text-sm text-muted-foreground">
            {hiddenMicro} gig{hiddenMicro === 1 ? "" : "s"} under ${MICRO_BUDGET_USD} hidden.{" "}
            <Link href={microToggleUrl(true)} className="text-primary hover:underline">
              Show them
            </Link>
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-4">
          {hasActiveFilters && (
            <Link href="/gigs" className="text-primary hover:underline">
              Clear filters
            </Link>
          )}
          <Link href="/gigs/new?type=hiring">
            <Button size="sm">Post what you need</Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil((count || 0) / limit);

  // Build pagination URL helper
  const buildPaginationUrl = (newPage: number) => {
    const params = new URLSearchParams();
    if (queryParams.search) params.set("search", queryParams.search);
    if (queryParams.category) params.set("category", queryParams.category);
    if (queryParams.location_type) params.set("location_type", queryParams.location_type);
    if (queryParams.budget_type) params.set("budget_type", queryParams.budget_type);
    if (queryParams.sort && queryParams.sort !== "newest") params.set("sort", queryParams.sort);
    if (includeMicro) params.set("include_micro", "1");
    params.set("page", String(newPage));
    const tagPath = tagList.length > 0 ? `/${tagList.map(encodeURIComponent).join(",")}` : "";
    return `/gigs${tagPath}?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {gigs.length} of {count} gigs
        {hiddenMicro > 0 && (
          <>
            {" · "}
            {hiddenMicro} under ${MICRO_BUDGET_USD} hidden{" "}
            <Link href={microToggleUrl(true)} className="text-primary hover:underline">
              Show them
            </Link>
          </>
        )}
        {includeMicro && (
          <>
            {" · "}
            <Link href={microToggleUrl(false)} className="text-primary hover:underline">
              Hide gigs under ${MICRO_BUDGET_USD}
            </Link>
          </>
        )}
      </p>

      <div className="space-y-4">
        {(gigs as unknown as GigCardData[]).map((gig) => (
          <GigCard key={gig.id} gig={gig} highlightTags={tagList} />
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

function GigsListSkeleton() {
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

export default async function GigsPage({ params, searchParams }: GigsPageProps) {
  const { tags } = await params;
  const queryParams = await searchParams;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Gigs (Hiring)</h1>
              <p className="text-muted-foreground">
                Work people need done. Selling a service instead? Post it as a{" "}
                <Link href="/gigs/new?type=for_hire" className="text-primary hover:underline">
                  for-hire listing
                </Link>
                , or{" "}
                <Link href="/for-hire" className="text-primary hover:underline">
                  browse ready-made services →
                </Link>
              </p>
            </div>
            <Link href="/gigs/new?type=hiring">
              <Button>Post what you need</Button>
            </Link>
          </div>

          <Suspense fallback={<div className="h-48" />}>
            <GigFiltersWithTags
              activeTags={tagList}
              search={queryParams.search}
              category={queryParams.category}
              locationType={queryParams.location_type}
              budgetType={queryParams.budget_type}
              sort={queryParams.sort}
            />
          </Suspense>

          <div className="mt-8">
            <Suspense fallback={<GigsListSkeleton />}>
              <GigsList params={params} searchParams={searchParams} />
            </Suspense>
          </div>

          <AdUnit />
        </div>
      </main>
    </div>
  );
}
