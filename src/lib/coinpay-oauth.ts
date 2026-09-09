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

/**
 * Why a CoinPay link cannot be used, when it cannot.
 *
 * "none" and "needs_reconnect" are different problems with different fixes,
 * and telling them apart is the whole point of this type. #553 taught the
 * connections page the difference; every API that gates on CoinPay needs it
 * too, because an agent calling the API never sees that page and the sentence
 * it gets back is the only instruction it will ever have.
 */
export type CoinpayLinkState = "none" | "needs_reconnect" | "connected";

export interface CoinpayLink {
  state: CoinpayLinkState;
  /** Present only when state is "connected". */
  accessToken: string | null;
}

/**
 * The user's CoinPay link, and what is wrong with it.
 *
 * Deliberately reports "needs_reconnect" for a link that exists and cannot
 * read wallets, rather than folding it into "not connected". That fold is what
 * produced the bug: a user with a pre-wallet:read token was told to connect an
 * account they had already connected, did nothing different because nothing
 * looked wrong, and hit the same wall again.
 */
export async function getCoinpayLink(userId: string): Promise<CoinpayLink> {
  const token = await resolveCoinpayToken(userId);
  return token.accessToken === null
    ? { state: token.hadIdentity ? "needs_reconnect" : "none", accessToken: null }
    : { state: "connected", accessToken: token.accessToken };
}

export async function getConnectedCoinpayAccessToken(userId: string): Promise<string | null> {
  return (await resolveCoinpayToken(userId)).accessToken;
}

async function resolveCoinpayToken(
  userId: string
): Promise<{ accessToken: string | null; hadIdentity: boolean }> {
  const serviceSupabase = createServiceClient();
  const { data } = await (serviceSupabase as any)
    .from("oauth_identities")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("provider", "coinpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Whether a link exists at all is the fact the caller cannot recover later,
  // so it travels with the token rather than being inferred from its absence.
  const hadIdentity = Boolean(data);

  const metadata = metadataObject(data?.metadata);
  const accessToken =
    typeof metadata.access_token === "string" ? metadata.access_token.trim() : "";

  // Tokens issued without wallet:read can't read the user's global wallets via
  // /api/oauth/userinfo. Treat them as unusable so the caller prompts the user
  // to reconnect CoinPay — the connections page uses the same predicate.
  if (!coinpayLinkCanReadWallets(metadata)) return { accessToken: null, hadIdentity };

  // Proactively refresh if the token is expired or about to expire.
  const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
  const isExpired = expiresAt ? Date.now() >= new Date(expiresAt).getTime() - EXPIRY_BUFFER_MS : false;

  if (isExpired) {
    const refreshToken = typeof metadata.refresh_token === "string" ? metadata.refresh_token.trim() : "";
    if (refreshToken && data?.id) {
      const refreshed = await refreshCoinpayToken(refreshToken, data.id);
      if (refreshed) return { accessToken: refreshed, hadIdentity };
    }
    // Refresh failed — the stored token is likely unusable; signal reconnect needed.
    return { accessToken: null, hadIdentity };
  }

  return { accessToken, hadIdentity };
}
