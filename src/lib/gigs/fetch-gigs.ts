import type { SupabaseClient } from "@supabase/supabase-js";
import { escapePostgrestSearchValue } from "@/lib/security/sanitize";
import { BOOST_ACTIVE_MS } from "@/lib/boost";

// Shared gig-listing fetch used by /gigs and /for-hire. Beyond the usual filters
// and sorting it pins "active" boosts (boosted within BOOST_ACTIVE_MS) to the very
// top of the default (newest) listing, ahead of everything else, for the boost window.

export const GIG_LIST_SELECT = `
  *,
  poster:profiles!poster_id (
    id,
    username,
    full_name,
    avatar_url,
    account_type,
    verified,
    verification_type
  )
`;

export interface GigListFilters {
  search?: string;
  category?: string;
  locationType?: string;
  budgetType?: string;
  tags: string[];
}

export interface FetchGigsOptions {
  listingType: "hiring" | "for_hire";
  filters: GigListFilters;
  sort?: string;
  page: number;
  limit: number;
}

export interface FetchGigsResult {
  gigs: Record<string, unknown>[];
  count: number;
}

const PINNED_SORTS = new Set([undefined, "", "newest"]);

type GigQuery = any;

function applyFilters(query: GigQuery, filters: GigListFilters): GigQuery {
  if (filters.search) {
    const safeSearch = escapePostgrestSearchValue(filters.search);
    query = query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
  }

  if (filters.category) {
    query = query.eq("category", filters.category);
  }

  if (
    filters.locationType &&
    ["remote", "onsite", "hybrid"].includes(filters.locationType)
  ) {
    query = query.eq("location_type", filters.locationType);
  }

  if (filters.budgetType) {
    query = query.eq("budget_type", filters.budgetType);
  }

  if (filters.tags.length > 0) {
    // Expand common casings so the (case-sensitive) array overlap matches.
    const expandedTags = new Set<string>();
    for (const tag of filters.tags) {
      expandedTags.add(tag);
      expandedTags.add(tag.toLowerCase());
      expandedTags.add(tag.charAt(0).toUpperCase() + tag.slice(1));
      expandedTags.add(tag.toUpperCase());
      expandedTags.add(tag.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    query = query.overlaps("skills_required", [...expandedTags]);
  }

  return query;
}

export async function fetchGigs(
  supabase: SupabaseClient,
  { listingType, filters, sort, page, limit }: FetchGigsOptions
): Promise<FetchGigsResult> {
  const base = (opts?: { select?: string; head?: boolean }): GigQuery => {
    const query = supabase
      .from("gigs")
      .select(opts?.select ?? GIG_LIST_SELECT, {
        count: "exact",
        head: opts?.head ?? false,
      })
      .eq("status", "active")
      .eq("listing_type", listingType);
    return applyFilters(query, filters);
  };

  const offset = (page - 1) * limit;

  // Non-default sorts respect the user's explicit choice — no boost pinning.
  if (!PINNED_SORTS.has(sort)) {
    let query = base();
    switch (sort) {
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
    const { data, count } = await query.range(offset, offset + limit - 1);
    return { gigs: data ?? [], count: count ?? 0 };
  }

  // Default (newest): pinned active boosts first, then the rest by recency.
  // Drop milliseconds so the timestamp has no characters PostgREST treats specially.
  const cutoff = new Date(Date.now() - BOOST_ACTIVE_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const notBoosted = `boosted_at.is.null,boosted_at.lt.${cutoff}`;

  // How many active-boosted gigs match the filters (drives where the page splits).
  const { count: boostedCount } = await base({ select: "id", head: true }).gte(
    "boosted_at",
    cutoff
  );
  const boostedTotal = boostedCount ?? 0;

  // Boosted slice for this page.
  const boostedStart = Math.min(offset, boostedTotal);
  const boostedEnd = Math.min(offset + limit, boostedTotal); // exclusive
  let boosted: Record<string, unknown>[] = [];
  if (boostedEnd > boostedStart) {
    const { data } = await base()
      .gte("boosted_at", cutoff)
      .order("boosted_at", { ascending: false })
      .range(boostedStart, boostedEnd - 1);
    boosted = data ?? [];
  }

  // Remaining slots filled from the non-boosted stream by recency.
  const needed = limit - boosted.length;
  const normalStart = Math.max(0, offset - boostedTotal);
  let normal: Record<string, unknown>[] = [];
  let normalTotal = 0;
  if (needed > 0) {
    const { data, count } = await base()
      .or(notBoosted)
      .order("created_at", { ascending: false })
      .range(normalStart, normalStart + needed - 1);
    normal = data ?? [];
    normalTotal = count ?? 0;
  } else {
    const { count } = await base({ select: "id", head: true }).or(notBoosted);
    normalTotal = count ?? 0;
  }

  return { gigs: [...boosted, ...normal], count: boostedTotal + normalTotal };
}
