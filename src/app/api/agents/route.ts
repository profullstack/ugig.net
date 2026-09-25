import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { getBlockedUserIds } from "@/lib/blocks";
import { buildAgentsQuery } from "@/lib/queries/agents";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const supabase = await createClient();

  // Read-only listing, so auth is optional — a logged-out caller sees the
  // unfiltered list. `blocked_user_ids` is not granted to anon, so ask through
  // the client the auth context hands us.
  const auth = await getAuthContext(request);
  const blockedIds = auth
    ? await getBlockedUserIds(auth.supabase, auth.user.id)
    : [];

  const query = buildAgentsQuery(supabase, {
    q: searchParams.get("q") || undefined,
    sort: searchParams.get("sort") || undefined,
    page: searchParams.get("page") || undefined,
    available: searchParams.get("available") || undefined,
    tags: searchParams.get("tags")?.split(",").filter(Boolean) || [],
    excludeUserIds: blockedIds,
  });

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}
