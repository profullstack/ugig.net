import type { SupabaseClient } from "@supabase/supabase-js";
import { coinpayLinkCanReadWallets, refreshCoinpayToken } from "@/lib/coinpay-oauth";
import { coinpayLinkFault, markCoinpayLinkBroken, type CoinpayLinkFault } from "@/lib/coinpay-link-health";

type Client = SupabaseClient<any, "public", any>;

/**
 * Keeps every CoinPay link alive, and finds the dead ones before a buyer does.
 *
 * Access tokens last an hour and were only refreshed when someone happened to
 * need one, so a link nobody touched for 30 days lost its refresh token too,
 * and a link CoinPay had stopped honouring was only discovered by a buyer who
 * then saw nothing. Daily (POST /api/cron/coinpay-links):
 *
 * - a refresh token not rotated for REFRESH_AFTER_MS is refreshed, which
 *   restarts CoinPay's 30-day refresh-token clock;
 * - a link that cannot be refreshed (refused, no refresh token, no wallet
 *   scope) is marked broken and its seller told once (see coinpay-link-health).
 */
export const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface IdentityRow {
  id: string;
  user_id: string;
  metadata: unknown;
  updated_at: string | null;
}

export interface SweepResult {
  links: number;
  refreshed: number;
  transient: number;
  broken: Record<CoinpayLinkFault, number>;
  notified: number;
  dryRun: boolean;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** What the sweep should do with one link, from what is stored. Pure. */
export function sweepAction(
  metadata: unknown,
  now: number
): { action: "ok" } | { action: "refresh"; refreshToken: string } | { action: "broken"; fault: CoinpayLinkFault } {
  const meta = metadataObject(metadata);
  const fault = coinpayLinkFault(meta);
  if (fault) return { action: "broken", fault };
  if (!coinpayLinkCanReadWallets(meta)) return { action: "broken", fault: "missing_scope" };
  const refreshToken = typeof meta.refresh_token === "string" ? meta.refresh_token.trim() : "";
  const expiresAt = typeof meta.expires_at === "string" ? Date.parse(meta.expires_at) : NaN;
  if (!refreshToken) {
    return Number.isFinite(expiresAt) && expiresAt > now ? { action: "ok" } : { action: "broken", fault: "no_refresh_token" };
  }
  const rotatedAt = [meta.refreshed_at, meta.connected_at]
    .map((v) => (typeof v === "string" ? Date.parse(v) : NaN))
    .find(Number.isFinite);
  if (rotatedAt === undefined || now - rotatedAt >= REFRESH_AFTER_MS) return { action: "refresh", refreshToken };
  return { action: "ok" };
}

export async function sweepCoinpayLinks(
  svc: Client,
  options: { now?: Date; dryRun?: boolean; maxRefresh?: number; refresh?: typeof refreshCoinpayToken } = {}
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const maxRefresh = options.maxRefresh ?? 300;
  const refresh = options.refresh ?? refreshCoinpayToken;

  const rows: IdentityRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc
      .from("oauth_identities")
      .select("id, user_id, metadata, updated_at")
      .eq("provider", "coinpay")
      .order("updated_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`Failed to read CoinPay links: ${error.message}`);
    rows.push(...((data as IdentityRow[] | null) ?? []));
    if (!data || data.length < 1000) break;
  }

  // The gate uses each user's newest link; so does the sweep.
  const seen = new Set<string>();
  const links = rows.filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)));

  const result: SweepResult = {
    links: links.length,
    refreshed: 0,
    transient: 0,
    broken: { refresh_rejected: 0, no_refresh_token: 0, missing_scope: 0 },
    notified: 0,
    dryRun,
  };

  let refreshes = 0;
  for (const link of links) {
    let step = sweepAction(link.metadata, now.getTime());
    if (step.action === "refresh") {
      if (dryRun || refreshes >= maxRefresh) continue;
      refreshes++;
      const r = await refresh(step.refreshToken, link.id, link.metadata);
      if (r.ok) {
        result.refreshed++;
        continue;
      }
      if (r.failure === "transient") {
        result.transient++;
        continue;
      }
      step = { action: "broken", fault: "refresh_rejected" };
    }
    if (step.action !== "broken") continue;
    result.broken[step.fault]++;
    // Already told about this breakage: nothing to write.
    if (dryRun || typeof metadataObject(link.metadata).reconnect_notified_at === "string") continue;
    const { notified } = await markCoinpayLinkBroken(svc, link, step.fault, now);
    if (notified) result.notified++;
  }
  return result;
}
