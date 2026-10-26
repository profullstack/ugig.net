#!/usr/bin/env bun
/**
 * Admin: mint, list and revoke ugig credit codes (days of Pro), and set a
 * user's invite quota. Talks to Supabase with the service role key.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/credit-codes.ts mint --days 30 [--max 1] [--label "for Preshy"] [--expires 2026-12-31]
 *   bun scripts/credit-codes.ts list
 *   bun scripts/credit-codes.ts revoke <codeId>
 *   bun scripts/credit-codes.ts quota <userId> <total>
 *
 * The same is available over HTTP to admins: POST/GET /api/admin/credit-codes.
 * The plaintext code is printed once; only its sha256 is stored.
 */
import { createClient } from "@supabase/supabase-js";
import { Credits, supabaseStore as creditStore } from "@profullstack/redeem-credits";
import { Affiliates, supabaseStore as affStore } from "@profullstack/affiliates";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const credits = new Credits(creditStore(db));

const [cmd, ...rest] = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

if (cmd === "mint") {
  const days = Number(flag("days"));
  if (!Number.isInteger(days) || days < 1) throw new Error("--days must be a positive whole number");
  const expires = flag("expires");
  const minted = await credits.mint({
    grant: { unit: "pro_days", amount: days },
    label: flag("label") ?? `${days} days of ugig Pro`,
    maxRedemptions: Number(flag("max") ?? 1),
    expiresAt: expires ? Date.parse(expires) : null,
    createdBy: flag("by") ?? "script",
  });
  console.log(JSON.stringify(minted, null, 2));
} else if (cmd === "list") {
  console.log(JSON.stringify(await credits.list(), null, 2));
} else if (cmd === "revoke" && rest[0]) {
  await credits.revoke(rest[0]);
  console.log("revoked", rest[0]);
} else if (cmd === "quota" && rest[0] && rest[1]) {
  await new Affiliates(affStore(db), { defaultQuota: 3 }).setQuota(rest[0], Number(rest[1]));
  console.log("quota", rest[0], rest[1]);
} else {
  console.error("usage: credit-codes.ts mint --days N [--max N] [--label L] [--expires DATE] | list | revoke <id> | quota <userId> <total>");
  process.exit(2);
}
