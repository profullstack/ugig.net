import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coinpayLinkHasLegacyTokens,
  coinpayLinkWallets,
  legacyCoinpayTokenMigrationEnabled,
  migrateLegacyCoinpayIdentity,
  withoutCoinpayTokens,
} from "@/lib/coinpay-oauth";
import { coinpayLinkFault, markCoinpayLinkBroken, type CoinpayLinkFault } from "@/lib/coinpay-link-health";

type Client = SupabaseClient<any, "public", any>;

/**
 * Daily (POST /api/cron/coinpay-links): moves every CoinPay link onto stored
 * wallet addresses and finds the dead ones before a buyer does.
 *
 * ugig no longer keeps CoinPay tokens (see coinpay-oauth.ts): a link is the
 * wallet snapshot taken when its owner connected. So the sweep:
 *
 * - migrates a link that still holds pre-snapshot plaintext tokens (one
 *   refresh + userinfo read, then the snapshot is written and the tokens are
 *   deleted in the same update). A link CoinPay refuses gets its tokens
 *   deleted and is marked broken; an outage leaves it for the next run;
 * - with LEGACY_KEY_MIGRATION=off, deletes leftover tokens without reading them;
 * - marks a link that has neither wallets nor tokens as broken, and tells its
 *   seller once (see coinpay-link-health).
 */

interface IdentityRow {
  id: string;
  user_id: string;
  metadata: unknown;
  updated_at: string | null;
}

export interface SweepResult {
  links: number;
  migrated: number;
  transient: number;
  scrubbed: number;
  broken: Record<CoinpayLinkFault, number>;
  notified: number;
  /** Rows still holding a plaintext CoinPay token after this run. */
  legacyRemaining: number;
  dryRun: boolean;
}

export type SweepStep =
  | { action: "ok" }
  | { action: "migrate" }
  | { action: "scrub" }
  | { action: "broken"; fault: CoinpayLinkFault };

/** What the sweep should do with one link, from what is stored. Pure. */
export function sweepAction(metadata: unknown, legacyEnabled: boolean = legacyCoinpayTokenMigrationEnabled()): SweepStep {
  if (coinpayLinkHasLegacyTokens(metadata)) return legacyEnabled ? { action: "migrate" } : { action: "scrub" };
  const fault = coinpayLinkFault(metadata);
  if (fault) return { action: "broken", fault };
  if (coinpayLinkWallets(metadata) !== null) return { action: "ok" };
  return { action: "broken", fault: "missing_scope" };
}

export async function sweepCoinpayLinks(
  svc: Client,
  options: {
    now?: Date;
    dryRun?: boolean;
    maxMigrations?: number;
    migrate?: typeof migrateLegacyCoinpayIdentity;
    legacyEnabled?: boolean;
  } = {}
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const maxMigrations = options.maxMigrations ?? 300;
  const migrate = options.migrate ?? migrateLegacyCoinpayIdentity;
  const legacyEnabled = options.legacyEnabled ?? legacyCoinpayTokenMigrationEnabled();

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

  // Sellers are told about their newest link only (the one the gate uses);
  // older rows are still migrated or scrubbed, quietly.
  const newest = new Set<string>();
  const seenUsers = new Set<string>();
  for (const r of rows) if (!seenUsers.has(r.user_id)) (seenUsers.add(r.user_id), newest.add(r.id));

  const result: SweepResult = {
    links: newest.size,
    migrated: 0,
    transient: 0,
    scrubbed: 0,
    broken: { refresh_rejected: 0, no_refresh_token: 0, missing_scope: 0 },
    notified: 0,
    legacyRemaining: 0,
    dryRun,
  };

  const recordOnly: typeof markCoinpayLinkBroken = async (client, identity, fault, at = now) => {
    const meta = (identity.metadata && typeof identity.metadata === "object" ? identity.metadata : {}) as Record<string, unknown>;
    const next = { ...meta, link_error: coinpayLinkFault(meta) ? meta.link_error : { code: fault, at: at.toISOString() } };
    await client.from("oauth_identities").update({ metadata: next }).eq("id", identity.id);
    return { notified: false };
  };

  let migrations = 0;
  for (const link of rows) {
    const isNewest = newest.has(link.id);
    const step = sweepAction(link.metadata, legacyEnabled);

    if (step.action === "migrate") {
      if (dryRun || migrations >= maxMigrations) {
        result.legacyRemaining++;
        continue;
      }
      migrations++;
      let notified = false;
      const markBroken: typeof markCoinpayLinkBroken = isNewest
        ? async (...args) => {
            const r = await markCoinpayLinkBroken(...args);
            notified = r.notified;
            return r;
          }
        : recordOnly;
      const r = await migrate(svc, link, { now, markBroken });
      if (r.kind === "migrated") result.migrated++;
      else if (r.kind === "transient") {
        result.transient++;
        result.legacyRemaining++;
      } else {
        if (isNewest) result.broken[r.fault]++;
        if (notified) result.notified++;
      }
      continue;
    }

    if (step.action === "scrub") {
      if (dryRun) {
        result.legacyRemaining++;
        continue;
      }
      const stripped = withoutCoinpayTokens(link.metadata);
      const { error } = await svc.from("oauth_identities").update({ metadata: stripped }).eq("id", link.id);
      if (error) result.legacyRemaining++;
      else result.scrubbed++;
      continue;
    }

    if (step.action !== "broken" || !isNewest) continue;
    result.broken[step.fault]++;
    // Already told about this breakage: nothing to write.
    if (dryRun || typeof (link.metadata as any)?.reconnect_notified_at === "string") continue;
    const { notified } = await markCoinpayLinkBroken(svc, link, step.fault, now);
    if (notified) result.notified++;
  }
  return result;
}
