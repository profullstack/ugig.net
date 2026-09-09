import { createServiceClient } from "@/lib/supabase/service";

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const REQUIRED_COINPAY_SCOPE = "wallet:read";

/**
 * Does this stored CoinPay link carry the scope we need to read wallets?
 *
 * The connection UI and the invoice gate have to answer this the same way. They
 * did not: the UI called any `oauth_identities` row "Connected", while invoicing
 * additionally required `wallet:read` and rejected the link without it. A user
 * whose token lacked the scope saw a green "Connected" badge and
 * "Connect your CoinPay account before sending an invoice" from the same
 * account, with no way to reconcile the two.
 */
export function coinpayLinkCanReadWallets(metadata: unknown): boolean {
  const meta = metadataObject(metadata);
  const accessToken = typeof meta.access_token === "string" ? meta.access_token.trim() : "";
  if (!accessToken) return false;
  const scope = typeof meta.scope === "string" ? meta.scope : "";
  return scope.split(/\s+/).filter(Boolean).includes(REQUIRED_COINPAY_SCOPE);
}
const TOKEN_URL = "https://coinpayportal.com/api/oauth/token";
// Refresh if token expires within 5 minutes
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

async function refreshCoinpayToken(
  refreshToken: string,
  identityId: string
): Promise<string | null> {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.COINPAY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      console.error("[coinpay-oauth] token refresh failed:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const tokens = await res.json();
    const newAccessToken = typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
    if (!newAccessToken) return null;

    const newMetadata: Record<string, unknown> = {
      access_token: newAccessToken,
      token_type: typeof tokens.token_type === "string" ? tokens.token_type : "Bearer",
      scope: typeof tokens.scope === "string" ? tokens.scope : null,
      expires_at:
        typeof tokens.expires_in === "number"
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
    };
    if (typeof tokens.refresh_token === "string") {
      newMetadata.refresh_token = tokens.refresh_token;
    } else {
      newMetadata.refresh_token = refreshToken;
    }

    const serviceSupabase = createServiceClient();
    await (serviceSupabase as any)
      .from("oauth_identities")
      .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
      .eq("id", identityId);

    return newAccessToken;
  } catch (err) {
    console.error("[coinpay-oauth] token refresh error:", err);
    return null;
  }
}

export async function getConnectedCoinpayAccessToken(userId: string): Promise<string | null> {
  const serviceSupabase = createServiceClient();
  const { data } = await (serviceSupabase as any)
    .from("oauth_identities")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("provider", "coinpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata = metadataObject(data?.metadata);
  const accessToken =
    typeof metadata.access_token === "string" ? metadata.access_token.trim() : "";

  // Tokens issued without wallet:read can't read the user's global wallets via
  // /api/oauth/userinfo. Treat them as disconnected so the UI prompts the user
  // to reconnect CoinPay — the connections page uses the same predicate.
  if (!coinpayLinkCanReadWallets(metadata)) return null;

  // Proactively refresh if the token is expired or about to expire.
  const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
  const isExpired = expiresAt ? Date.now() >= new Date(expiresAt).getTime() - EXPIRY_BUFFER_MS : false;

  if (isExpired) {
    const refreshToken = typeof metadata.refresh_token === "string" ? metadata.refresh_token.trim() : "";
    if (refreshToken && data?.id) {
      const refreshed = await refreshCoinpayToken(refreshToken, data.id);
      if (refreshed) return refreshed;
    }
    // Refresh failed — the stored token is likely unusable; signal reconnect needed.
    return null;
  }

  return accessToken;
}
