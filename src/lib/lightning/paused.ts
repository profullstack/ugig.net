/**
 * Zaps, deposits and withdrawals can be switched off without a rebuild
 * (LIGHTNING_PAUSED=1): CoinPay's Lightning node was emptied on 2026-10-27
 * and runs with no channels. Reads (balances, history, leaderboard) stay up.
 *
 * Read at request time: Next inlines `process.env.NAME` at build.
 */
const env = (name: string) => process.env[name];

export function lightningPaused(): boolean {
  return /^(1|true|yes|on)$/i.test(env("LIGHTNING_PAUSED") ?? "");
}

const WRITES = [/^\/api\/zaps\/?$/, /^\/api\/wallet\/zap\/?$/, /^\/api\/wallet\/deposit(\/.*)?$/, /^\/api\/wallet\/withdraw\/?$/];

/** A request that moves sats. */
export function isLightningWrite(method: string, path: string): boolean {
  return method !== "GET" && method !== "HEAD" && WRITES.some((re) => re.test(path));
}

export const LIGHTNING_PAUSED_MESSAGE =
  "Zaps, deposits and withdrawals are paused while our Lightning node is rebuilt. Balances are safe to view.";
