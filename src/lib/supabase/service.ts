import { createClient as createSupabaseClient, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Create a Supabase client with service role key.
 * Use this for server-side operations that need elevated permissions.
 */
// Singleton service client — avoids creating new realtime WebSocket connections per call
let _serviceClient: SupabaseClient<Database> | null = null;

export function createServiceClient(): SupabaseClient<Database> {
  if (_serviceClient) return _serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  _serviceClient = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Disconnect realtime — service client only needs REST
  _serviceClient.realtime.disconnect();

  return _serviceClient;
}

/** Three base64url segments: the shape of a JWT, and so of a Supabase access token. */
export function isJwtShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

/**
 * Authenticate a request using Bearer token.
 * Returns the user and supabase client if valid, null otherwise.
 */
export async function authenticateWithToken(authHeader: string | null): Promise<{
  user: User;
  supabase: SupabaseClient<Database>;
} | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  // Only a JWT can be a Supabase session token. `getAuthContext` tries this
  // before API-key auth, so every `Bearer ugig_…` request used to send the key
  // to GoTrue's /auth/v1/user and get a 403 back before the key was even
  // checked: ~2,300 wasted round trips an hour on dev2, 2026-09-25.
  if (!isJwtShaped(token)) {
    return null;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createSupabaseClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Disconnect realtime immediately — token auth clients only need REST
  supabase.realtime.disconnect();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }

  return { user, supabase };
}
