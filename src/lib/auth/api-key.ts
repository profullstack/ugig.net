import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { getKeyPrefix, verifyApiKey } from "@/lib/api-keys";
import type { Database } from "@/types/database";

import type { ApiKeyScope } from "@/lib/api-keys";

export type ApiKeyAuthResult = {
  userId: string;
  keyId: string;
  scope: ApiKeyScope;
};

/**
 * Authenticate a request using an API key from the Authorization header.
 * Returns the user ID and key ID if valid, null otherwise.
 */
function isLikelyApiKey(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  return /^ugig_[a-z]+_/i.test(v);
}

function extractApiKey(
  authHeader: string | null,
  apiKeyHeader?: string | null
): string | null {
  const headerKey = apiKeyHeader?.trim() || null;
  if (isLikelyApiKey(headerKey)) {
    return headerKey;
  }

  if (!authHeader) return null;
  const trimmed = authHeader.trim();

  // Support common auth schemes used by API clients
  const patterns = [/^Bearer\s+(.+)$/i, /^ApiKey\s+(.+)$/i, /^Token\s+(.+)$/i];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && isLikelyApiKey(match[1])) {
      return match[1].trim();
    }
  }

  return null;
}

export async function authenticateApiKey(
  authHeader: string | null,
  apiKeyHeader?: string | null
): Promise<ApiKeyAuthResult | null> {
  const rawKey = extractApiKey(authHeader, apiKeyHeader);

  if (!rawKey) {
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
        scope: (candidate.scope as ApiKeyScope) || "full",
      };
    }
  }

  return null;
}
