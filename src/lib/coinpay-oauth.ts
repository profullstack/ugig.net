import { createServiceClient } from "@/lib/supabase/service";
import { coinpayLinkFault, markCoinpayLinkBroken, type CoinpayLinkFault } from "@/lib/coinpay-link-health";
import {
  normalizeGlobalWallets,
  readCoinpayUserinfoWallets,
  validateCoinpayReceivingAddress,
  type CoinPayGlobalWallet,
  type SupportedCurrency,
} from "@/lib/coinpayportal";

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const REQUIRED_COINPAY_SCOPE = "wallet:read";

/*
 * A CoinPay link stores the seller's WALLET ADDRESSES, never their tokens.
 *
 * The only thing ugig ever did with a stored CoinPay access/refresh token was
 * read the user's global receiving wallets (/api/oauth/userinfo) while they
 * were offline: Buy now, gig invoices and bounty payouts. Addresses are public
 * payout coordinates, not secrets, so the OAuth callback now snapshots them
 * (`metadata.wallets`, `metadata.wallets_synced_at`) from the userinfo it
 * already fetches and throws the tokens away. Nothing on the server can act as
 * the user on CoinPay any more (2026-10-28 fleet rule: no user secret readable
 * by anything stored on our servers). Reconnecting re-syncs the addresses.
 *
 * Links made before that still carry plaintext tokens. While
 * LEGACY_KEY_MIGRATION is not "off", such a link is migrated the first time it
 * is used (or by the daily coinpay-links sweep): one refresh + userinfo read,
 * then the snapshot is written and the tokens are deleted in the same update.
 * With the switch off, legacy tokens are never read and the sweep deletes them.
 */
export const COINPAY_TOKEN_FIELDS = ["access_token", "refresh_token", "token_type", "expires_at", "refreshed_at"] as const;

export function legacyCoinpayTokenMigrationEnabled(): boolean {
  return (process.env.LEGACY_KEY_MIGRATION || "").trim().toLowerCase() !== "off";
}

/** The wallet fields kept in a snapshot: enough to pay out, nothing more. */
export function coinpayWalletSnapshot(wallets: CoinPayGlobalWallet[]): CoinPayGlobalWallet[] {
  return wallets.map((w) => ({
    ...(w.id ? { id: w.id } : {}),
    currency: w.currency,
    cryptocurrency: w.cryptocurrency,
    label: w.label ?? null,
    address: w.address,
    network: w.network ?? null,
  }));
}

/**
 * The wallets stored on a link, or null when the link has no snapshot.
 * An empty array is a real answer: connected, with no addresses set yet.
 * Entries are re-validated on the way out; a malformed one is dropped.
 */
export function coinpayLinkWallets(metadata: unknown): CoinPayGlobalWallet[] | null {
  const meta = metadataObject(metadata);
  if (!Array.isArray(meta.wallets)) return null;
  const out: CoinPayGlobalWallet[] = [];
  for (const item of meta.wallets) {
    const w = metadataObject(item);
    const currency = typeof w.currency === "string" ? (w.currency as SupportedCurrency) : null;
    const address = typeof w.address === "string" ? w.address.trim() : "";
    if (!currency || !address || !validateCoinpayReceivingAddress(currency, address)) continue;
    out.push({
      ...(typeof w.id === "string" ? { id: w.id } : {}),
      currency,
      cryptocurrency: typeof w.cryptocurrency === "string" ? w.cryptocurrency : currency.toUpperCase(),
      label: typeof w.label === "string" ? w.label : null,
      address,
      network: typeof w.network === "string" ? w.network : null,
    });
  }
  return out;
}

/** Does this link still hold a plaintext CoinPay token from before snapshots? */
export function coinpayLinkHasLegacyTokens(metadata: unknown): boolean {
  const meta = metadataObject(metadata);
  return ["access_token", "refresh_token"].some(
    (k) => typeof meta[k] === "string" && (meta[k] as string).trim() !== ""
  );
}

/** The metadata with every token field removed. */
export function withoutCoinpayTokens(metadata: unknown): Record<string, unknown> {
  const next = { ...metadataObject(metadata) };
  for (const k of COINPAY_TOKEN_FIELDS) delete next[k];
  return next;
}

/**
 * Identity metadata for a fresh OAuth grant: the snapshot, no tokens.
 * `wallets` is left out when userinfo had no `wallets` claim (a grant without
 * wallet:read), which reads as "needs reconnect" exactly as before.
 */
export function coinpayIdentityMetadata(
  tokens: Record<string, unknown>,
  userinfo: Record<string, unknown>,
  now: Date = new Date()
): Record<string, unknown> {
  const hasWalletClaim = Boolean(userinfo) && typeof userinfo === "object" && "wallets" in userinfo;
  return {
    name: typeof userinfo.name === "string" ? userinfo.name : null,
    coinpay_sub: typeof userinfo.sub === "string" ? userinfo.sub : null,
    scope: typeof tokens.scope === "string" ? tokens.scope : null,
    ...(hasWalletClaim
      ? {
          wallets: coinpayWalletSnapshot(normalizeGlobalWallets(userinfo.wallets)),
          wallets_synced_at: now.toISOString(),
        }
      : {}),
    connected_at: now.toISOString(),
  };
}

/** The pre-snapshot test: a stored token carrying wallet:read. */
export function legacyCoinpayTokenCanReadWallets(metadata: unknown): boolean {
  const meta = metadataObject(metadata);
  const accessToken = typeof meta.access_token === "string" ? meta.access_token.trim() : "";
  if (!accessToken) return false;
  const scope = typeof meta.scope === "string" ? meta.scope : "";
  return scope.split(/\s+/).filter(Boolean).includes(REQUIRED_COINPAY_SCOPE);
}

/**
 * Can this stored CoinPay link supply wallets?
 *
 * The connection UI and the invoice gate have to answer this the same way. They
 * did not: the UI called any `oauth_identities` row "Connected", while invoicing
 * additionally required `wallet:read` and rejected the link without it. A user
 * whose token lacked the scope saw a green "Connected" badge and
 * "Connect your CoinPay account before sending an invoice" from the same
 * account, with no way to reconcile the two.
 *
 * True for a wallet snapshot, or (until the legacy cutoff) a not-yet-migrated
 * token that carries wallet:read.
 */
export function coinpayLinkCanReadWallets(metadata: unknown): boolean {
  if (coinpayLinkWallets(metadata) !== null) return true;
  return legacyCoinpayTokenMigrationEnabled() && legacyCoinpayTokenCanReadWallets(metadata);
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

/**
 * What a refresh attempt came to.
 *
 * `rejected` means CoinPay refused the refresh token itself (invalid_grant):
 * the link is dead until its owner reconnects. Anything else (CoinPay down, a
 * 5xx, a timeout, our own client config) is `transient`: the stored refresh
 * token is still good and the next attempt may well work, so it must never be
 * reported to the seller as a dead link.
 */
export type CoinpayRefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; failure: "rejected" | "transient" };

export async function refreshCoinpayToken(
  refreshToken: string,
  identityId: string,
  previousMetadata: unknown,
  fetchImpl: typeof fetch = fetch
): Promise<CoinpayRefreshResult> {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.COINPAY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, failure: "transient" };

  const serviceSupabase = createServiceClient();
  try {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[coinpay-oauth] token refresh failed:", res.status, text);
      let error = "";
      try {
        error = String(JSON.parse(text)?.error ?? "");
      } catch {
        // not JSON: a gateway or proxy page, so not CoinPay's verdict on the token
      }
      if (res.status !== 400 || error !== "invalid_grant") return { ok: false, failure: "transient" };

      // CoinPay rotates refresh tokens, and two requests refreshing the same
      // link at once both send the old one: the loser gets invalid_grant even
      // though the link is fine. If the row now holds a different refresh token
      // and a live access token, the other request won; use its token.
      const { data } = await (serviceSupabase as any)
        .from("oauth_identities")
        .select("metadata")
        .eq("id", identityId)
        .maybeSingle();
      const now = metadataObject(data?.metadata);
      const nowAccess = typeof now.access_token === "string" ? now.access_token.trim() : "";
      const nowExpires = typeof now.expires_at === "string" ? Date.parse(now.expires_at) : NaN;
      if (now.refresh_token !== refreshToken && nowAccess && Number.isFinite(nowExpires) && nowExpires > Date.now()) {
        return { ok: true, accessToken: nowAccess };
      }
      return { ok: false, failure: "rejected" };
    }

    const tokens = await res.json();
    const newMetadata = mergeRefreshedCoinpayMetadata(previousMetadata, tokens ?? {}, refreshToken);
    if (!newMetadata) return { ok: false, failure: "transient" };
    const newAccessToken = newMetadata.access_token as string;

    const { error } = await (serviceSupabase as any)
      .from("oauth_identities")
      .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
      .eq("id", identityId);
    // CoinPay has already revoked the old refresh token. Losing the new one
    // here would kill the link, so say so loudly.
    if (error) console.error("[coinpay-oauth] could not store refreshed CoinPay tokens:", error.message);

    return { ok: true, accessToken: newAccessToken };
  } catch (err) {
    console.error("[coinpay-oauth] token refresh error:", err);
    return { ok: false, failure: "transient" };
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
  /** The link's receiving wallets. Present (possibly empty) only when state is "connected". */
  wallets: CoinPayGlobalWallet[] | null;
  /** When the wallets were last read from CoinPay (the last connect). */
  syncedAt?: string | null;
  /**
   * True when the link is fine but CoinPay could not be reached to migrate it
   * just now. State is still "needs_reconnect" for callers that only gate, but
   * nobody should be told to reconnect.
   */
  temporary?: boolean;
}

interface IdentityRow {
  id: string;
  user_id: string;
  metadata: unknown;
}

/**
 * The user's CoinPay link, and what is wrong with it.
 *
 * Deliberately reports "needs_reconnect" for a link that exists and cannot
 * supply wallets, rather than folding it into "not connected". That fold is
 * what produced the bug: a user with a pre-wallet:read token was told to
 * connect an account they had already connected, did nothing different
 * because nothing looked wrong, and hit the same wall again.
 *
 * No network call for a migrated link: the wallets are the stored snapshot.
 */
export async function getCoinpayLink(userId: string): Promise<CoinpayLink> {
  const serviceSupabase = createServiceClient();
  const { data } = await (serviceSupabase as any)
    .from("oauth_identities")
    .select("id, user_id, metadata")
    .eq("user_id", userId)
    .eq("provider", "coinpay")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { state: "none", wallets: null };
  const metadata = metadataObject(data.metadata);
  const reconnect: CoinpayLink = { state: "needs_reconnect", wallets: null };

  // A link CoinPay already refused stays dead until its owner reconnects.
  if (coinpayLinkFault(metadata)) return reconnect;

  const wallets = coinpayLinkWallets(metadata);
  if (wallets !== null) {
    const syncedAt = typeof metadata.wallets_synced_at === "string" ? metadata.wallets_synced_at : null;
    return { state: "connected", wallets, syncedAt };
  }

  if (coinpayLinkHasLegacyTokens(metadata) && legacyCoinpayTokenMigrationEnabled()) {
    const migrated = await migrateLegacyCoinpayIdentity(serviceSupabase as any, data as IdentityRow);
    if (migrated.kind === "migrated") {
      return { state: "connected", wallets: migrated.wallets, syncedAt: migrated.syncedAt };
    }
    if (migrated.kind === "transient") return { ...reconnect, temporary: true };
  }
  return reconnect;
}

export type LegacyMigrationResult =
  | { kind: "migrated"; wallets: CoinPayGlobalWallet[]; syncedAt: string }
  | { kind: "transient" }
  | { kind: "dead"; fault: CoinpayLinkFault };

/**
 * Turn a pre-snapshot link (plaintext tokens) into a snapshot link.
 *
 * Reads the wallets once with the stored token (refreshing it if it has
 * expired), then writes the snapshot and deletes every token field in ONE
 * update. A token CoinPay refuses, or one without wallet:read, is deleted too
 * (it can never read wallets again; reconnecting issues a new grant) and the
 * link is marked broken so its seller is told once. A CoinPay outage changes
 * nothing, so the next attempt can try again.
 */
export async function migrateLegacyCoinpayIdentity(
  svc: any,
  row: IdentityRow,
  deps: {
    now?: Date;
    refresh?: typeof refreshCoinpayToken;
    readWallets?: typeof readCoinpayUserinfoWallets;
    markBroken?: typeof markCoinpayLinkBroken;
  } = {}
): Promise<LegacyMigrationResult> {
  const now = deps.now ?? new Date();
  const refresh = deps.refresh ?? refreshCoinpayToken;
  const readWallets = deps.readWallets ?? readCoinpayUserinfoWallets;
  const markBroken = deps.markBroken ?? markCoinpayLinkBroken;
  const meta = metadataObject(row.metadata);

  const dead = async (fault: CoinpayLinkFault): Promise<LegacyMigrationResult> => {
    const stripped = withoutCoinpayTokens(meta);
    // markCoinpayLinkBroken writes the metadata it is given, so the tokens go
    // in the same write that records the fault.
    await markBroken(svc, { ...row, metadata: stripped }, fault, now);
    return { kind: "dead", fault };
  };

  if (!legacyCoinpayTokenCanReadWallets(meta)) return dead("missing_scope");

  const stored = typeof meta.access_token === "string" ? meta.access_token.trim() : "";
  const expiresAt = typeof meta.expires_at === "string" ? Date.parse(meta.expires_at) : NaN;
  let token = stored && (!Number.isFinite(expiresAt) || now.getTime() < expiresAt - EXPIRY_BUFFER_MS) ? stored : "";

  let read: Awaited<ReturnType<typeof readCoinpayUserinfoWallets>> | null = null;
  try {
    if (token) {
      read = await readWallets(token);
      if (read.status === "unauthorized") read = null; // try a refresh below
    }
    if (!read) {
      const refreshToken = typeof meta.refresh_token === "string" ? meta.refresh_token.trim() : "";
      if (!refreshToken) return dead("no_refresh_token");
      const refreshed = await refresh(refreshToken, row.id, row.metadata);
      if (!refreshed.ok) return refreshed.failure === "rejected" ? dead("refresh_rejected") : { kind: "transient" };
      token = refreshed.accessToken;
      read = await readWallets(token);
    }
  } catch {
    // CoinPay 5xx or timeout: not the seller's fault, try again later.
    return { kind: "transient" };
  }

  if (read.status === "unauthorized") return dead("refresh_rejected");
  if (read.status === "no_wallet_claim") return dead("missing_scope");

  const syncedAt = now.toISOString();
  const wallets = coinpayWalletSnapshot(read.wallets);
  const next = withoutCoinpayTokens(meta);
  next.wallets = wallets;
  next.wallets_synced_at = syncedAt;
  next.tokens_removed_at = syncedAt;
  delete next.link_error;
  delete next.reconnect_notified_at;
  const { error } = await svc
    .from("oauth_identities")
    .update({ metadata: next, updated_at: syncedAt })
    .eq("id", row.id);
  if (error) {
    console.error("[coinpay-oauth] could not store the wallet snapshot:", error.message);
    return { kind: "transient" };
  }
  return { kind: "migrated", wallets, syncedAt };
}

/**
 * Can this stored link be used, judged from what is stored alone?
 *
 * Usable means: a wallet snapshot, or (a link not yet migrated) an access
 * token with wallet:read and either an unexpired token or a refresh token to
 * get a new one. No network call, so the
 * payer side (single and bulk payment requests) can ask it for every invoice
 * without spending CoinPay's rate limit on refreshes it does not need.
 */
export function storedCoinpayLinkState(
  metadata: unknown,
  hasIdentity: boolean,
  now: number = Date.now()
): CoinpayLinkState {
  if (!hasIdentity) return "none";
  if (coinpayLinkFault(metadata)) return "needs_reconnect";
  if (coinpayLinkWallets(metadata) !== null) return "connected";
  // Not yet migrated: judge the stored token as before. Using it migrates it.
  if (!legacyCoinpayTokenMigrationEnabled() || !legacyCoinpayTokenCanReadWallets(metadata)) return "needs_reconnect";
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
