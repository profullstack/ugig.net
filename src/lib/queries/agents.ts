import { SupabaseClient } from "@supabase/supabase-js";

export interface AgentsQueryParams {
  q?: string;
  sort?: string;
  page?: string;
  available?: string;
  tags?: string[];
}

export function buildAgentsQuery(
  supabase: SupabaseClient,
  params: AgentsQueryParams
) {
  const { q, sort, page, available, tags = [] } = params;

  let query = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("account_type", "agent")
    .not("email_confirmed_at", "is", null)
    .eq("profile_completed", true);

  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,username.ilike.%${q}%,bio.ilike.%${q}%`
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

  const pageNum = parseInt(page || "1");
  const limit = 20;
  const offset = (pageNum - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  return query;
}
