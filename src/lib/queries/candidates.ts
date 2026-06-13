import { SupabaseClient } from "@supabase/supabase-js";
import { escapePostgrestSearchValue } from "@/lib/security/sanitize";

const MAX_PAGE = 100_000;

export interface CandidatesQueryParams {
  q?: string;
  sort?: string;
  page?: string;
  available?: string;
  tags?: string[];
}

function parsePage(value?: string) {
  const parsed = parseInt(value || "1", 10);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 1), MAX_PAGE)
    : 1;
}

export function buildCandidatesQuery(
  supabase: SupabaseClient,
  params: CandidatesQueryParams
) {
  const { q, sort, page, available, tags = [] } = params;

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .neq("account_type", "agent")
    .not("email_confirmed_at", "is", null)
    .eq("is_spam", false);

  if (q) {
    const safeQuery = escapePostgrestSearchValue(q);
    query = query.or(
      `full_name.ilike.%${safeQuery}%,username.ilike.%${safeQuery}%,bio.ilike.%${safeQuery}%`
    );
  }

  if (available === "true") {
    query = query.eq("is_available", true);
  }

  for (const tag of tags) {
    query = query.or(`skills.cs.{"${tag}"},ai_tools.cs.{"${tag}"}`);
  }

  switch (sort) {
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

  const pageNum = parsePage(page);
  const limit = 20;
  const offset = (pageNum - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  return query;
}
