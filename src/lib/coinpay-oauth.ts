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

/**
 * The identity metadata to store after a refresh.
 *
 * Merged over what was there, not a replacement. The original version wrote a
 * fresh object, which threw away `coinpay_sub`, `name` and `connected_at` on
 * every refresh (46 of 101 prod links had lost them by 2026-10-06), and wrote
 * `scope: null` whenever the token response left `scope` out. RFC 6749 5.1
 * makes `scope` optional when it is unchanged, and a null scope fails
 * `coinpayLinkCanReadWallets`, so a routine refresh could turn a working link
 * into "reconnect required" for no reason.
 */
export function mergeRefreshedCoinpayMetadata(
  previous: unknown,
  tokens: Record<string, unknown>,
  refreshToken: string,
  now: number = Date.now()
): Record<string, unknown> | null {
  const prev = metadataObject(previous);
  const newAccessToken = typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
  if (!newAccessToken) return null;
  const scope =
    typeof tokens.scope === "string" && tokens.scope.trim()
      ? tokens.scope
      : typeof prev.scope === "string"
        ? prev.scope
        : null;
  return {
    ...prev,
    access_token: newAccessToken,
    token_type: typeof tokens.token_type === "string" ? tokens.token_type : "Bearer",
    scope,
    expires_at:
      typeof tokens.expires_in === "number"
        ? new Date(now + tokens.expires_in * 1000).toISOString()
        : null,
    refresh_token: typeof tokens.refresh_token === "string" ? tokens.refresh_token : refreshToken,
    refreshed_at: new Date(now).toISOString(),
  };
}

async function refreshCoinpayToken(
  refreshToken: string,
  identityId: string,
  previousMetadata: unknown
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
    const newMetadata = mergeRefreshedCoinpayMetadata(previousMetadata, tokens ?? {}, refreshToken);
    if (!newMetadata) return null;
    const newAccessToken = newMetadata.access_token as string;

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
      const refreshed = await refreshCoinpayToken(refreshToken, data.id, data.metadata);
      if (refreshed) return { accessToken: refreshed, hadIdentity };
    }
    // Refresh failed — the stored token is likely unusable; signal reconnect needed.
    return { accessToken: null, hadIdentity };
  }

  return { accessToken, hadIdentity };
}

/**
 * Can this stored link be used, judged from what is stored alone?
 *
 * Usable means: an access token, the wallet:read scope, and either an
 * unexpired token or a refresh token to get a new one. No network call, so the
 * payer side (single and bulk payment requests) can ask it for every invoice
 * without spending CoinPay's rate limit on refreshes it does not need.
 */
export function storedCoinpayLinkState(
  metadata: unknown,
  hasIdentity: boolean,
  now: number = Date.now()
): CoinpayLinkState {
  if (!hasIdentity) return "none";
  if (!coinpayLinkCanReadWallets(metadata)) return "needs_reconnect";
  const meta = metadataObject(metadata);
  const expiresAt = typeof meta.expires_at === "string" ? Date.parse(meta.expires_at) : NaN;
  const expired = Number.isFinite(expiresAt) && now >= expiresAt;
  const refreshToken = typeof meta.refresh_token === "string" ? meta.refresh_token.trim() : "";
  if (expired && !refreshToken) return "needs_reconnect";
  return "connected";
}

/** The worker's CoinPay link state from the database, without refreshing. */
export async function getStoredCoinpayLinkState(userId: string): Promise<CoinpayLinkState> {
  const serviceSupabase = createServiceClient();
  const { data, error } = await (serviceSupabase as any)
    .from("oauth_identities")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("provider", "coinpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read CoinPay link: ${error.message}`);
  return storedCoinpayLinkState(data?.metadata, Boolean(data));
}

/**
 * Stored link state for many users at once (one query), for list pages.
 * Users with no row come back as "none".
 */
export async function getStoredCoinpayLinkStates(
  userIds: string[]
): Promise<Map<string, CoinpayLinkState>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const states = new Map<string, CoinpayLinkState>();
  if (ids.length === 0) return states;
  const serviceSupabase = createServiceClient();
  const { data, error } = await (serviceSupabase as any)
    .from("oauth_identities")
    .select("user_id, metadata, updated_at")
    .eq("provider", "coinpay")
    .in("user_id", ids)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to read CoinPay links: ${error.message}`);
  for (const row of (data ?? []) as Array<{ user_id: string; metadata: unknown }>) {
    // Newest first, so the first row per user wins (same rule as the gate).
    if (!states.has(row.user_id)) {
      states.set(row.user_id, storedCoinpayLinkState(row.metadata, true));
    }
  }
  for (const id of ids) if (!states.has(id)) states.set(id, "none");
  return states;
}
