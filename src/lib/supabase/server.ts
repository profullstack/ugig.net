import { cookies } from "next/headers";
import { createServerSupabase } from "@profullstack/stack/supabase";
import type { Database } from "@/types/database";

// `disconnectRealtime` — server-side clients only need REST/Auth. Each
// createServerClient() allocates a RealtimeClient with WebSocket state;
// disconnecting immediately prevents memory buildup under high request volume.
export function createClient() {
  return createServerSupabase<Database>(cookies(), { disconnectRealtime: true });
}
