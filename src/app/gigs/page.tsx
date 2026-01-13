import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GigCard } from "@/components/gigs/GigCard";
import { GigFilters } from "@/components/gigs/GigFilters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Browse Gigs | ugig.net",
  description: "Find AI-assisted gigs and freelance opportunities",
};

interface GigsPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    location_type?: string;
    sort?: string;
    page?: string;
  }>;
}

async function GigsList({ searchParams }: { searchParams: GigsPageProps["searchParams"] }) {
  const params = await searchParams;
  const supabase = await createClient();

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
        avatar_url
      )
    `,
      { count: "exact" }
    )
    .eq("status", "active");

  // Apply filters
  if (params.search) {
    query = query.or(
      `title.ilike.%${params.search}%,description.ilike.%${params.search}%`
    );
  }

  if (params.category) {
    query = query.eq("category", params.category);
  }

  if (params.location_type && ["remote", "onsite", "hybrid"].includes(params.location_type)) {
    query = query.eq("location_type", params.location_type as "remote" | "onsite" | "hybrid");
  }

  // Apply sorting
  switch (params.sort) {
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
  const page = parseInt(params.page || "1");
  const limit = 20;
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data: gigs, count } = await query;

  if (!gigs || gigs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No gigs found matching your criteria.</p>
        <Link href="/gigs" className="text-primary hover:underline mt-2 inline-block">
          Clear filters
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil((count || 0) / limit);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {gigs.map((gig) => (
          <GigCard key={gig.id} gig={gig} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/gigs?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
            >
              <Button variant="outline">Previous</Button>
            </Link>
          )}
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/gigs?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
            >
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

export default async function GigsPage({ searchParams }: GigsPageProps) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            ugig.net
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/gigs/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Post a Gig
              </Button>
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Log In
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Browse Gigs</h1>
          <p className="text-muted-foreground mb-8">
            Find AI-assisted opportunities from clients worldwide
          </p>

          <Suspense fallback={<div className="h-32" />}>
            <GigFilters />
          </Suspense>

          <div className="mt-8">
            <Suspense fallback={<GigsListSkeleton />}>
              <GigsList searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
