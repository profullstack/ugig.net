import type { SupabaseClient } from "@supabase/supabase-js";
import { escapePostgrestSearchValue } from "@/lib/security/sanitize";
import { excludeBlocked } from "@/lib/blocks";
import { BOOST_ACTIVE_MS } from "@/lib/boost";
import { NOT_MICRO_BUDGET_FILTER } from "@/lib/gigs/micro-budget";
import { attachSellerTrust } from "@/lib/trust/seller-trust";

// Shared gig-listing fetch used by /gigs and /for-hire. Beyond the usual filters
// and sorting it pins "active" boosts (boosted within BOOST_ACTIVE_MS) to the very
// top of the default (newest) listing, ahead of everything else, for the boost window.
// When `verifiedPosterIds` is given (the hiring board), posts by people who have
// paid someone on ugig come next, then everything else by recency. Every gig
// comes back with `poster.trust` (see lib/trust/seller-trust.ts).

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
  /**
   * Poster ids to hide from this viewer — the blocked-user list. Applied to the
   * count queries too, so pagination matches what is actually shown.
   */
  excludeUserIds?: string[];
  /**
   * Leave out gigs whose stated budget tops out under $5 (see micro-budget.ts).
   * The hiring board's default view sets this; the count of what was left out
   * comes back as `hiddenMicro` so the page can offer to show them.
   */
  hideMicroBudgets?: boolean;
  /**
   * Posters who have paid someone on ugig. In the default sort their posts rank
   * right after active boosts. `verifiedOnly` limits the listing to them.
   */
  verifiedPosterIds?: string[];
  verifiedOnly?: boolean;
}

export interface FetchGigsResult {
  gigs: Record<string, unknown>[];
  count: number;
  /** Gigs matching the filters that hideMicroBudgets left out (0 when not hiding). */
  hiddenMicro: number;
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
  {
    listingType,
    filters,
    sort,
    page,
    limit,
    excludeUserIds = [],
    hideMicroBudgets = false,
    verifiedPosterIds = [],
    verifiedOnly = false,
  }: FetchGigsOptions
): Promise<FetchGigsResult> {
  const result = await fetchGigRows(supabase, {
    listingType,
    filters,
    sort,
    page,
    limit,
    excludeUserIds,
    hideMicroBudgets,
    verifiedPosterIds,
    verifiedOnly,
  });
  await attachSellerTrust(supabase, result.gigs);
  return result;
}

// PostgREST `in` list of ids. Ids are uuids from our own RPC, nothing to escape.
const idList = (ids: string[]) => `(${ids.join(",")})`;

async function fetchGigRows(
  supabase: SupabaseClient,
  {
    listingType,
    filters,
    sort,
    page,
    limit,
    excludeUserIds = [],
    hideMicroBudgets = false,
    verifiedPosterIds = [],
    verifiedOnly = false,
  }: FetchGigsOptions
): Promise<FetchGigsResult> {
  const verified = verifiedPosterIds;
  if (verifiedOnly && verified.length === 0) return { gigs: [], count: 0, hiddenMicro: 0 };
  const unfiltered = (opts?: { select?: string; head?: boolean }): GigQuery => {
    const query = supabase
      .from("gigs")
      .select(opts?.select ?? GIG_LIST_SELECT, {
        count: "exact",
        head: opts?.head ?? false,
      })
      .eq("status", "active")
      .eq("listing_type", listingType);
    const filtered = excludeBlocked(applyFilters(query, filters), "poster_id", excludeUserIds);
    return verifiedOnly ? filtered.in("poster_id", verified) : filtered;
  };
  const base = (opts?: { select?: string; head?: boolean }): GigQuery =>
    hideMicroBudgets ? unfiltered(opts).or(NOT_MICRO_BUDGET_FILTER) : unfiltered(opts);

  const countHiddenMicro = async (shown: number): Promise<number> => {
    if (!hideMicroBudgets) return 0;
    const { count } = await unfiltered({ select: "id", head: true });
    return Math.max(0, (count ?? 0) - shown);
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
    return { gigs: data ?? [], count: count ?? 0, hiddenMicro: await countHiddenMicro(count ?? 0) };
  }

  // Default (newest): pinned active boosts first, then (hiring board) verified
  // posters, then the rest, each tier by recency. Tiers are disjoint, so the
  // page is cut across them by their counts.
  // Drop milliseconds so the timestamp has no characters PostgREST treats specially.
  const cutoff = new Date(Date.now() - BOOST_ACTIVE_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const notBoosted = `boosted_at.is.null,boosted_at.lt.${cutoff}`;
  const splitVerified = !verifiedOnly && verified.length > 0;

  type Tier = { scope: (q: GigQuery) => GigQuery; orderBy: string };
  const tiers: Tier[] = [
    { scope: (q) => q.gte("boosted_at", cutoff), orderBy: "boosted_at" },
  ];
  if (splitVerified) {
    tiers.push({
      scope: (q) => q.or(notBoosted).in("poster_id", verified),
      orderBy: "created_at",
    });
    tiers.push({
      scope: (q) => q.or(notBoosted).not("poster_id", "in", idList(verified)),
      orderBy: "created_at",
    });
  } else {
    tiers.push({ scope: (q) => q.or(notBoosted), orderBy: "created_at" });
  }

  const counts = await Promise.all(
    tiers.map(async (tier) => {
      const { count } = await tier.scope(base({ select: "id", head: true }));
      return count ?? 0;
    })
  );

  const gigs: Record<string, unknown>[] = [];
  let tierStart = 0;
  for (let i = 0; i < tiers.length; i++) {
    const tierEnd = tierStart + counts[i];
    const from = Math.max(offset + gigs.length, tierStart);
    const to = Math.min(offset + limit, tierEnd); // exclusive
    if (to > from) {
      const { data } = await tiers[i]
        .scope(base())
        .order(tiers[i].orderBy, { ascending: false })
        .range(from - tierStart, to - tierStart - 1);
      gigs.push(...((data ?? []) as Record<string, unknown>[]));
    }
    tierStart = tierEnd;
  }

  const total = counts.reduce((a, b) => a + b, 0);
  return { gigs, count: total, hiddenMicro: await countHiddenMicro(total) };
}
