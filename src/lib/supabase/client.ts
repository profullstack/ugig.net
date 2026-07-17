import { createBrowserSupabase } from "@profullstack/stack/supabase";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserSupabase<Database>();
}
