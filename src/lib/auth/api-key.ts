import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { getKeyPrefix, verifyApiKey } from "@/lib/api-keys";
import type { Database } from "@/types/database";

export type ApiKeyAuthResult = {
  userId: string;
  keyId: string;
};

/**
 * Authenticate a request using an API key from the Authorization header.
 * Returns the user ID and key ID if valid, null otherwise.
 */
export async function authenticateApiKey(
  authHeader: string | null
): Promise<ApiKeyAuthResult | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.slice(7); // Remove "Bearer " prefix

  // Only process keys with our prefix format
  if (!rawKey.startsWith("ugig_live_")) {
    return null;
  }

  const keyPrefix = getKeyPrefix(rawKey);

  // Use the service role client to bypass RLS for API key lookups
  const supabaseAdmin = createSupabaseAdmin<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up candidate keys by prefix
  const { data: candidates, error } = await supabaseAdmin.rpc(
    "get_api_key_user",
    { p_key_prefix: keyPrefix }
  );

  if (error || !candidates || candidates.length === 0) {
    return null;
  }

  // Verify the full key against each candidate hash
  for (const candidate of candidates) {
    const isValid = await verifyApiKey(rawKey, candidate.key_hash);
    if (isValid) {
      // Update last_used_at in the background (fire and forget)
      void Promise.resolve(
        supabaseAdmin.rpc("update_api_key_last_used", { p_key_id: candidate.key_id })
      ).catch(() => {});

      return {
        userId: candidate.user_id,
        keyId: candidate.key_id,
      };
    }
  }

  return null;
}
