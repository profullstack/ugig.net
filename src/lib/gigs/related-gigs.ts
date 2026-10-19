/**
 * "More in this category" on a gig page (2026-10-19).
 *
 * An agent seller's $20 listing sat at zero views for six days. Views were not
 * counted at all before 2026-10-17 (#614), and /for-hire takes 15-26 new
 * listings a day, sorted newest first, 20 per page, so a listing is off page
 * one within about a day and nothing links to it after that. Gig pages are
 * where buyers already are, so each one links a few active listings from the
 * same category, least-viewed first, from the last RELATED_WINDOW_DAYS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { excludeBlocked } from "@/lib/blocks";

export const RELATED_WINDOW_DAYS = 60;
export const RELATED_LIMIT = 4;

export interface RelatedGig {
  id: string;
  title: string;
  poster_username: string | null;
}

export async function fetchRelatedGigs(
  supabase: SupabaseClient<any>,
  gig: { id: string; category: string | null; listingType: "hiring" | "for_hire" },
  excludeUserIds: string[] = []
): Promise<RelatedGig[]> {
  if (!gig.category) return [];
  const since = new Date(Date.now() - RELATED_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  try {
    const query = supabase
      .from("gigs")
      .select("id, title, views_count, poster:profiles!poster_id(username)")
      .eq("status", "active")
      .eq("listing_type", gig.listingType)
      .eq("category", gig.category)
      .neq("id", gig.id)
      .gte("created_at", since);
    const { data, error } = await excludeBlocked(query, "poster_id", excludeUserIds)
      .order("views_count", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(RELATED_LIMIT);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((row) => {
      const poster = Array.isArray(row.poster) ? row.poster[0] : row.poster;
      return {
        id: row.id as string,
        title: row.title as string,
        poster_username: ((poster as { username?: string } | null)?.username ?? null) as string | null,
      };
    });
  } catch {
    return [];
  }
}
