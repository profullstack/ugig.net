#!/usr/bin/env tsx
/**
 * Backfill homepage screenshots for directory listings that have none.
 *
 * Usage:
 *   tsx scripts/backfill-screenshots.ts            # capture everything missing
 *   tsx scripts/backfill-screenshots.ts --dry-run  # list what would be captured
 *   tsx scripts/backfill-screenshots.ts --limit 5  # cap how many are rendered
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RASTERLY_API_KEY in .env
 *
 * rasterly's free tier is 100 renders/month, so the script reports the quota
 * remaining after each capture and stops if the API says the budget is gone.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { config } from "dotenv";

config(); // load .env

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RASTERLY_KEY = process.env.RASTERLY_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !RASTERLY_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or RASTERLY_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit =
  limitArg !== -1 && args[limitArg + 1] ? Number(args[limitArg + 1]) : Infinity;

type Listing = { id: string; title: string; url: string };

async function render(url: string): Promise<{ buf: Buffer; quota: string | null }> {
  const endpoint = `https://api.rasterly.dev/v1/screenshot?url=${encodeURIComponent(
    url
  )}&format=png&width=1280&height=800`;

  const res = await fetch(endpoint, {
    headers: { "X-Api-Key": RASTERLY_KEY },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`rasterly HTTP ${res.status}`);
  if (!(res.headers.get("content-type") || "").startsWith("image/")) {
    throw new Error("rasterly returned a non-image response");
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("rasterly returned an empty image");

  return { buf, quota: res.headers.get("x-quota-remaining") };
}

async function upload(url: string, buf: Buffer): Promise<string> {
  // Same path shape the fetch-meta route writes, so both sources interleave.
  const urlHash = crypto.createHash("md5").update(url).digest("hex");
  const filePath = `${urlHash}/${Date.now()}.png`;

  const { error } = await supabase.storage
    .from("directory-screenshots")
    .upload(filePath, buf, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`upload failed: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("directory-screenshots").getPublicUrl(filePath);

  return publicUrl;
}

async function main() {
  const { data, error } = await supabase
    .from("project_listings")
    .select("id, title, url")
    .eq("status", "active")
    .is("screenshot_url", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to read listings:", error.message);
    process.exit(1);
  }

  const listings = (data || []) as Listing[];
  console.log(`${listings.length} active listing(s) without a screenshot`);

  if (dryRun) {
    for (const l of listings) console.log(`  would capture: ${l.title} — ${l.url}`);
    return;
  }

  let done = 0;
  let failed = 0;

  for (const listing of listings) {
    if (done >= limit) {
      console.log(`Reached --limit ${limit}, stopping.`);
      break;
    }

    try {
      const { buf, quota } = await render(listing.url);
      const publicUrl = await upload(listing.url, buf);

      const { error: updateError } = await supabase
        .from("project_listings")
        .update({ screenshot_url: publicUrl })
        .eq("id", listing.id);

      if (updateError) throw new Error(`update failed: ${updateError.message}`);

      done++;
      console.log(`✓ ${listing.title} — ${buf.length} bytes, quota left: ${quota ?? "?"}`);

      if (quota !== null && Number(quota) <= 0) {
        console.log("rasterly quota exhausted, stopping.");
        break;
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${listing.title} — ${msg}`);
    }
  }

  console.log(`\nCaptured ${done}, failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
