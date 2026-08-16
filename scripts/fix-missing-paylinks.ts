#!/usr/bin/env npx tsx
/**
 * Repair users whose Lightning Address does not resolve.
 *
 * /.well-known/lnurlp/<username> looks up the user's LNbits wallet and returns
 * its first lnurlp link. If the wallet has no link the address 404s, even though
 * the profile advertises it. This finds those wallets and creates the missing link.
 *
 * The link is always created on the user's OWN wallet, so payments land with the
 * right person. The LNbits-side `username` is claimed only when it is still free —
 * on the shared LNbits instance it is often already held by an orphaned wallet,
 * and it is not needed for the address to resolve through ugig.net.
 *
 * Usage: npx tsx scripts/fix-missing-paylinks.ts [--apply]
 * Runs read-only unless --apply is passed.
 */
import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const LNBITS_URL = process.env.LNBITS_URL || "https://ln.coinpayportal.com";

const APPLY = process.argv.includes("--apply");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** LNbits rate-limits bursts with 429s; retry with backoff. */
async function lnbits(path: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${LNBITS_URL}${path}`, init);
    if (res.status !== 429) return res;
    await sleep(1500 * (attempt + 1));
  }
  return fetch(`${LNBITS_URL}${path}`, init);
}

async function main() {
  const { data: wallets } = (await supabase
    .from("user_ln_wallets" as any)
    .select("user_id, admin_key, wallet_id")) as any;
  if (!wallets?.length) {
    console.log("No wallets found");
    return;
  }

  console.log(`Checking ${wallets.length} wallets${APPLY ? "" : " (dry run — pass --apply to fix)"}\n`);

  let broken = 0;
  let fixed = 0;
  let failed = 0;

  for (const w of wallets) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", w.user_id)
      .single();
    const username = profile?.username;
    if (!username) continue; // wallet with no profile — nothing to advertise

    const listRes = await lnbits("/lnurlp/api/v1/links", {
      headers: { "X-Api-Key": w.admin_key, Accept: "application/json" },
    });
    if (!listRes.ok) {
      console.log(`[SKIP] ${username}: cannot list links (${listRes.status})`);
      failed++;
      continue;
    }

    const links = await listRes.json();
    if (Array.isArray(links) && links.length > 0) continue; // already payable

    broken++;
    if (!APPLY) {
      console.log(`[BROKEN] ${username}`);
      continue;
    }

    const lnUsername = username.toLowerCase();
    const base = {
      description: `ugig.net wallet for ${lnUsername}`,
      min: 1,
      max: 10000000,
      comment_chars: 255,
      disposable: false,
    };

    let created = null;
    for (const body of [{ ...base, username: lnUsername, domain: "ugig.net" }, base]) {
      const res = await lnbits("/lnurlp/api/v1/links", {
        method: "POST",
        headers: { "X-Api-Key": w.admin_key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        created = await res.json();
        break;
      }
    }

    if (created) {
      await supabase
        .from("profiles" as any)
        .update({ ln_address: `${lnUsername}@ugig.net` } as any)
        .eq("id", w.user_id);
      console.log(`[OK] ${username} -> ${lnUsername}@ugig.net (link ${created.id})`);
      fixed++;
    } else {
      console.log(`[FAIL] ${username}: could not create pay link`);
      failed++;
    }

    await sleep(300);
  }

  console.log(
    `\nwallets=${wallets.length} broken=${broken} ${APPLY ? `fixed=${fixed} ` : ""}failed=${failed}`
  );
}

main();
