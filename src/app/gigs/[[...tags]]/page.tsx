import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GigCard } from "@/components/gigs/GigCard";
import { GigFiltersWithTags } from "@/components/gigs/GigFiltersWithTags";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Briefcase } from "lucide-react";

interface GigsPageProps {
  params: Promise<{ tags?: string[] }>;
  searchParams: Promise<{
    search?: string;
    category?: string;
    location_type?: string;
    sort?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ params }: GigsPageProps) {
  const { tags } = await params;
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  if (tagList.length > 0) {
    return {
      title: `${tagList.join(", ")} Gigs | ugig.net`,
      description: `Find AI-powered gig opportunities requiring ${tagList.join(", ")}`,
    };
  }

  return {
    title: "Browse Gigs | ugig.net",
    description: "Find AI-assisted gigs and freelance opportunities",
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

  // Parse tags from URL (comma-separated)
  const tagList = tags?.[0]?.split(",").map(decodeURIComponent) || [];

  // Build query
  let query = supabase
    .from("gigs")
    .select(
      `
      *,
      poster:profiles!poster_id (
        id,
        username,
        full_name,
        avatar_url,
        account_type
      )
    `,
      { count: "exact" }
    )
    .eq("status", "active");

  // Filter by search query
  if (queryParams.search) {
    query = query.or(
      `title.ilike.%${queryParams.search}%,description.ilike.%${queryParams.search}%`
    );
  }

  // Filter by category
  if (queryParams.category) {
    query = query.eq("category", queryParams.category);
  }

  // Filter by location type
  if (queryParams.location_type && ["remote", "onsite", "hybrid"].includes(queryParams.location_type)) {
    query = query.eq("location_type", queryParams.location_type as "remote" | "onsite" | "hybrid");
  }

  // Filter by skill tags
  // We need to filter gigs that have ANY of the tags in their skills_required
  if (tagList.length > 0) {
    // Use case-insensitive array overlap
    query = query.overlaps("skills_required", tagList);
  }

  // Apply sorting
  switch (queryParams.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "budget_high":
      query = query.order("budget_max", { ascending: false, nullsFirst: false });
      break;
    case "budget_low":
      query = query.order("budget_min", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  // Pagination
  const page = parseInt(queryParams.page || "1");
  const limit = 20;
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: gigs, count } = await query;

  if (!gigs || gigs.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">No gigs found matching your criteria.</p>
        {tagList.length > 0 && (
          <Link href="/gigs" className="text-primary hover:underline">
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
    if (queryParams.search) params.set("search", queryParams.search);
    if (queryParams.category) params.set("category", queryParams.category);
    if (queryParams.location_type) params.set("location_type", queryParams.location_type);
    if (queryParams.sort && queryParams.sort !== "newest") params.set("sort", queryParams.sort);
    params.set("page", String(newPage));
    const tagPath = tagList.length > 0 ? `/${tagList.map(encodeURIComponent).join(",")}` : "";
    return `/gigs${tagPath}?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {gigs.length} of {count} gigs
      </p>

      <div className="space-y-4">
        {gigs.map((gig) => (
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
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Browse Gigs</h1>
          <p className="text-muted-foreground mb-8">
            Find AI-assisted opportunities from clients worldwide
          </p>

          <Suspense fallback={<div className="h-48" />}>
            <GigFiltersWithTags
              activeTags={tagList}
              search={queryParams.search}
              category={queryParams.category}
              locationType={queryParams.location_type}
              sort={queryParams.sort}
            />
          </Suspense>

          <div className="mt-8">
            <Suspense fallback={<GigsListSkeleton />}>
              <GigsList params={params} searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
