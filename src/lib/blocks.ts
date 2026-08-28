import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * True when either user has blocked the other. Blocking is recorded one-way but
 * enforced symmetrically: the blocked user must not be able to reach around the
 * block by initiating contact themselves.
 *
 * RLS hides a block row from the person it names, so this goes through the
 * SECURITY DEFINER `users_are_blocked` function rather than querying the table.
 */
export async function usersAreBlocked(
  supabase: Client,
  userA: string,
  userB: string
): Promise<boolean> {
  if (userA === userB) return false;

  const { data, error } = await supabase.rpc("users_are_blocked", {
    user_a: userA,
    user_b: userB,
  });

  if (error) {
    // Fail closed on a lookup error: silently allowing contact is the worse
    // outcome of the two.
    console.error("users_are_blocked failed:", error.message);
    return true;
  }

  return data === true;
}

/**
 * Every user id the given user should not see content from, in either
 * direction. Returns an empty array when the user is not logged in.
 */
export async function getBlockedUserIds(
  supabase: Client,
  userId: string | null
): Promise<string[]> {
  if (!userId) return [];

  const { data, error } = await supabase.rpc("blocked_user_ids", {
    for_user: userId,
  });

  if (error) {
    console.error("blocked_user_ids failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.user_id);
}

/**
 * PostgREST filter value for "id is not one of these". Returns null when there
 * is nothing to exclude, so callers can skip the filter entirely.
 */
export function notInFilter(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return `(${ids.join(",")})`;
}
