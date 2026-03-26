#!/usr/bin/env npx tsx
/**
 * Batch security scan all skill listings by fetching their skill_file_url.
 *
 * Fetches each skill file URL, runs the security scanner, and updates
 * the scan results in the DB. Does NOT store the file — just scans it.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/scan-all-skills.ts          # scan unscanned with URLs
 *   npx tsx --env-file=.env scripts/scan-all-skills.ts --all    # rescan everything with URLs
 *   npx tsx --env-file=.env scripts/scan-all-skills.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { BuiltInScanner, scanWithRetry, SCANNER_VERSION } from "../src/lib/skills/security-scan";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_FETCH_SIZE = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  console.error("Run with: npx tsx --env-file=.env scripts/scan-all-skills.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const scanner = new BuiltInScanner();

const args = process.argv.slice(2);
const scanAll = args.includes("--all");
const dryRun = args.includes("--dry-run");

async function fetchFile(url: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "SkillScanner/0.1 (ugig.net)" },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_FETCH_SIZE) return null;

    let fileName = "skill-file";
    try {
      fileName = new URL(url).pathname.split("/").pop() || fileName;
    } catch { /* keep default */ }

    return { buffer: Buffer.from(ab), fileName };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n🔍 Skill Security Scanner (${SCANNER_VERSION})`);
  console.log(`   Mode: ${scanAll ? "rescan all" : "unscanned only"}${dryRun ? " [DRY RUN]" : ""}\n`);

  let query = supabase
    .from("skill_listings")
    .select("id, slug, title, seller_id, skill_file_url, scan_status")
    .eq("status", "active")
    .not("skill_file_url", "is", null)
    .order("created_at", { ascending: true });

  if (!scanAll) {
    query = query.is("scan_status", null);
  }

  const { data: listings, error } = await query;

  if (error) {
    console.error("Failed to fetch listings:", error.message);
    process.exit(1);
  }

  if (!listings || listings.length === 0) {
    console.log("✅ No skills need scanning.");
    return;
  }

  console.log(`Found ${listings.length} skill(s) to scan:\n`);

  const results = { processed: 0, clean: 0, suspicious: 0, malicious: 0, error: 0, fetchFailed: 0 };

  for (const listing of listings) {
    const l = listing as any;
    results.processed++;
    process.stdout.write(`  [${results.processed}/${listings.length}] ${l.title} (${l.slug})\n`);
    process.stdout.write(`    URL: ${l.skill_file_url}\n`);

    if (dryRun) {
      console.log(`    → would fetch and scan\n`);
      continue;
    }

    // Fetch
    process.stdout.write(`    Fetching... `);
    const fetched = await fetchFile(l.skill_file_url);

    if (!fetched) {
      console.log(`❌ fetch failed\n`);
      results.fetchFailed++;
      continue;
    }

    console.log(`✅ ${fetched.buffer.length} bytes`);

    // Scan
    process.stdout.write(`    Scanning... `);
    try {
      const scanResult = await scanWithRetry(scanner, fetched.buffer, fetched.fileName, {
        maxRetries: 1,
        timeoutMs: 30_000,
      });

      const contentHash = createHash("sha256").update(fetched.buffer).digest("hex");
      const findingsCountBySeverity: Record<string, number> = {};
      for (const f of scanResult.findings) {
        findingsCountBySeverity[f.severity] = (findingsCountBySeverity[f.severity] || 0) + 1;
      }

      let riskLevel = scanResult.status === "clean" ? "none" : scanResult.status;
      if (scanResult.findings.length > 0) {
        for (const sev of ["critical", "high", "medium", "low"]) {
          if (scanResult.findings.some((f) => f.severity === sev)) {
            riskLevel = sev;
            break;
          }
        }
      }

      const scannedAt = new Date().toISOString();

      // Save scan record
      await supabase.from("skill_security_scans").insert({
        listing_id: l.id,
        file_path: l.skill_file_url,
        file_hash: scanResult.fileHash,
        file_size_bytes: scanResult.fileSizeBytes,
        scan_status: scanResult.status,
        scan_source: "batch_scan",
        source_url: l.skill_file_url,
        content_hash: contentHash,
        scanner_version: scanResult.scannerVersion,
        findings_count_by_severity: findingsCountBySeverity,
        findings_summary: {
          risk_level: riskLevel,
          issues: scanResult.findings.map((f) => ({ severity: f.severity, detail: f.detail })),
          scanner_version: scanResult.scannerVersion,
        },
        scanned_at: scannedAt,
      });

      // Update listing scan status
      await supabase
        .from("skill_listings")
        .update({ scan_status: scanResult.status, content_hash: contentHash, scan_source: "batch_scan" })
        .eq("id", l.id);

      const emoji = scanResult.status === "clean" ? "✅" : scanResult.status === "suspicious" ? "⚠️" : "🚨";
      console.log(`${emoji} ${scanResult.status} (${scanResult.findings.length} findings)`);

      if (scanResult.findings.length > 0) {
        for (const f of scanResult.findings.slice(0, 3)) {
          console.log(`      ${f.severity}: ${f.detail}`);
        }
        if (scanResult.findings.length > 3) console.log(`      +${scanResult.findings.length - 3} more`);
      }

      results[scanResult.status as keyof typeof results] = ((results[scanResult.status as keyof typeof results] as number) || 0) + 1;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      results.error++;
    }

    console.log();
  }

  console.log(`📊 Results:`);
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Clean: ${results.clean}`);
  console.log(`   Suspicious: ${results.suspicious}`);
  console.log(`   Malicious: ${results.malicious}`);
  console.log(`   Fetch failed: ${results.fetchFailed}`);
  console.log(`   Errors: ${results.error}`);
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
