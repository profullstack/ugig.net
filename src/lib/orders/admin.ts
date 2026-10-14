import type { SupabaseClient } from "@supabase/supabase-js";

/** Same rule as the /admin page: profiles.is_admin. */
export async function isProfileAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).single();
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}
