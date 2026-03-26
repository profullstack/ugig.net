#!/usr/bin/env npx tsx
/**
 * Batch security scan for MCP server listings and/or skill listings.
 *
 * MCP listings:  runs SpiderShield + mcp-scan (combined MCP scanner)
 * Skill listings: runs the built-in skill security scanner
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/scan-all-listings.ts                 # scan both (default)
 *   npx tsx --env-file=.env scripts/scan-all-listings.ts --mcps          # scan MCP listings only
 *   npx tsx --env-file=.env scripts/scan-all-listings.ts --skills        # scan skill listings only
 *   npx tsx --env-file=.env scripts/scan-all-listings.ts --all           # rescan all (not just unscanned)
 *   npx tsx --env-file=.env scripts/scan-all-listings.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// ── Env ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  console.error("Run with: npx tsx --env-file=.env scripts/scan-all-listings.ts --mcps");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasExplicitTarget = args.includes("--mcps") || args.includes("--skills");
const scanMcps = hasExplicitTarget ? args.includes("--mcps") : true;
const scanSkills = hasExplicitTarget ? args.includes("--skills") : true;
const scanAllStatuses = args.includes("--all");
const dryRun = args.includes("--dry-run");
const DELAY_MS = 1000; // rate-limit between scans

// ── MCP Scanner (SpiderShield + mcp-scan) ──────────────────────────

async function scanMcpListings() {
  // Dynamic import to avoid loading MCP deps when only scanning skills
  const { combinedScan, MCP_SCANNER_VERSION } = await import("../src/lib/mcp/security-scan");

  console.log(`\n🔌 MCP Server Scanner (${MCP_SCANNER_VERSION})`);
  console.log(`   Mode: ${scanAllStatuses ? "rescan all" : "unscanned only"}${dryRun ? " [DRY RUN]" : ""}\n`);

  let query = supabase
    .from("mcp_listings")
    .select("id, slug, title, seller_id, mcp_server_url, source_url, scan_status, status")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (!scanAllStatuses) {
    query = query.or("scan_status.is.null,scan_status.eq.unscanned,scan_status.eq.pending");
  }

  const { data: listings, error } = await query;

  if (error) {
    console.error("Failed to fetch MCP listings:", error.message);
    return;
  }

  if (!listings || listings.length === 0) {
    console.log("✅ No MCP listings need scanning.\n");
    return;
  }

  console.log(`Found ${listings.length} MCP listing(s) to scan:\n`);

  const results = { processed: 0, clean: 0, warning: 0, critical: 0, error: 0, noUrl: 0 };

  for (const listing of listings) {
    const l = listing as any;
    results.processed++;
    console.log(`  [${results.processed}/${listings.length}] ${l.title} (${l.slug})`);

    const targetUrl = l.mcp_server_url || l.source_url;
    if (!targetUrl) {
      console.log(`    ⏭️  No server URL or source URL — skipping\n`);
      results.noUrl++;
      continue;
    }

    console.log(`    URL: ${targetUrl}`);

    if (dryRun) {
      console.log(`    → would scan\n`);
      continue;
    }

    try {
      process.stdout.write(`    Scanning... `);
      const sourceContext = l.mcp_server_url ? (l.source_url || undefined) : undefined;
      const scanResult = await combinedScan(targetUrl, sourceContext);

      // Persist scan record
      const { error: scanInsertError } = await supabase
        .from("mcp_security_scans")
        .insert({
          listing_id: l.id,
          scanner_version: scanResult.scannerVersion,
          status: scanResult.status,
          rating: scanResult.rating,
          security_score: scanResult.securityScore,
          findings: scanResult.findings,
          spidershield_report: scanResult.spidershieldReport,
          mcp_scan_report: scanResult.mcpScanReport,
        });

      if (scanInsertError) {
        console.error(`\n    ⚠️  Failed to save scan record: ${scanInsertError.message}`);
      }

      // Update listing cached fields
      await supabase
        .from("mcp_listings")
        .update({
          scan_status: scanResult.status,
          scan_rating: scanResult.rating,
        })
        .eq("id", l.id);

      const emoji = scanResult.status === "clean" ? "✅" : scanResult.status === "warning" ? "⚠️" : scanResult.status === "critical" ? "🚨" : "❌";
      console.log(`${emoji} ${scanResult.status} (rating: ${scanResult.rating || "—"}, score: ${scanResult.securityScore ?? "—"}, ${scanResult.findings.length} findings)`);

      if (scanResult.findings.length > 0) {
        for (const f of scanResult.findings.slice(0, 3)) {
          console.log(`      [${f.source}] ${f.severity}: ${f.detail.slice(0, 100)}`);
        }
        if (scanResult.findings.length > 3) console.log(`      +${scanResult.findings.length - 3} more`);
      }

      const spAvail = scanResult.spidershieldReport.available ? "✓" : "✗";
      const mcpAvail = scanResult.mcpScanReport.available ? "✓" : "✗";
      console.log(`    Tools: spidershield=${spAvail} mcp-scan=${mcpAvail}`);

      if (scanResult.status === "clean") results.clean++;
      else if (scanResult.status === "warning") results.warning++;
      else if (scanResult.status === "critical") results.critical++;
      else results.error++;

      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      results.error++;
    }

    console.log();
  }

  console.log(`📊 MCP Scan Results:`);
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Clean: ${results.clean}`);
  console.log(`   Warning: ${results.warning}`);
  console.log(`   Critical: ${results.critical}`);
  console.log(`   No URL: ${results.noUrl}`);
  console.log(`   Errors: ${results.error}`);
  console.log();
}

// ── Skill Scanner (built-in) ───────────────────────────────────────

async function scanSkillListings() {
  const { BuiltInScanner, scanWithRetry, SCANNER_VERSION } = await import("../src/lib/skills/security-scan");

  console.log(`\n📦 Skill Security Scanner (${SCANNER_VERSION})`);
  console.log(`   Mode: ${scanAllStatuses ? "rescan all" : "unscanned only"}${dryRun ? " [DRY RUN]" : ""}\n`);

  // Fetch listings that have either a URL or an uploaded file
  let query = supabase
    .from("skill_listings")
    .select("id, slug, title, seller_id, skill_file_url, skill_file_path, scan_status")
    .eq("status", "active")
    .or("skill_file_url.not.is.null,skill_file_path.not.is.null")
    .order("created_at", { ascending: true });

  if (!scanAllStatuses) {
    query = query.is("scan_status", null);
  }

  const { data: listings, error } = await query;

  if (error) {
    console.error("Failed to fetch skill listings:", error.message);
    return;
  }

  if (!listings || listings.length === 0) {
    console.log("✅ No skill listings need scanning.\n");
    return;
  }

  console.log(`Found ${listings.length} skill(s) to scan:\n`);

  const scanner = new BuiltInScanner();
  const results = { processed: 0, clean: 0, suspicious: 0, malicious: 0, error: 0, fetchFailed: 0 };

  for (const listing of listings) {
    const l = listing as any;
    results.processed++;
    console.log(`  [${results.processed}/${listings.length}] ${l.title} (${l.slug})`);

    const source = l.skill_file_url ? `URL: ${l.skill_file_url}` : `Storage: ${l.skill_file_path}`;
    console.log(`    ${source}`);

    if (dryRun) {
      console.log(`    → would fetch and scan\n`);
      continue;
    }

    // Fetch from URL or Supabase Storage
    process.stdout.write(`    Fetching... `);
    let buffer: Buffer;
    let fileName = "skill-file";
    try {
      if (l.skill_file_url) {
        // Fetch from remote URL
        const res = await fetch(l.skill_file_url, {
          signal: AbortSignal.timeout(15_000),
          headers: { "User-Agent": "SkillScanner/0.1 (ugig.net)" },
          redirect: "follow",
        });
        if (!res.ok) {
          console.log(`❌ HTTP ${res.status}\n`);
          results.fetchFailed++;
          continue;
        }
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 50 * 1024 * 1024) {
          console.log(`❌ too large (${ab.byteLength} bytes)\n`);
          results.fetchFailed++;
          continue;
        }
        buffer = Buffer.from(ab);
        try { fileName = new URL(l.skill_file_url).pathname.split("/").pop() || fileName; } catch {}
      } else {
        // Download from Supabase Storage
        const { data, error: dlError } = await supabase.storage
          .from("skill-files")
          .download(l.skill_file_path);
        if (dlError || !data) {
          console.log(`❌ storage download failed: ${dlError?.message || "no data"}\n`);
          results.fetchFailed++;
          continue;
        }
        const ab = await data.arrayBuffer();
        buffer = Buffer.from(ab);
        fileName = l.skill_file_path.split("/").pop() || fileName;
      }
      console.log(`✅ ${buffer.length} bytes`);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}\n`);
      results.fetchFailed++;
      continue;
    }

    // Scan
    process.stdout.write(`    Scanning... `);
    try {
      const scanResult = await scanWithRetry(scanner, buffer, fileName, {
        maxRetries: 1,
        timeoutMs: 30_000,
      });

      const contentHash = createHash("sha256").update(buffer).digest("hex");
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
        scanned_at: new Date().toISOString(),
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
          console.log(`      ${f.severity}: ${f.detail.slice(0, 100)}`);
        }
        if (scanResult.findings.length > 3) console.log(`      +${scanResult.findings.length - 3} more`);
      }

      if (scanResult.status === "clean") results.clean++;
      else if (scanResult.status === "suspicious") results.suspicious++;
      else if (scanResult.status === "malicious") results.malicious++;
      else results.error++;

      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      results.error++;
    }

    console.log();
  }

  console.log(`📊 Skill Scan Results:`);
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Clean: ${results.clean}`);
  console.log(`   Suspicious: ${results.suspicious}`);
  console.log(`   Malicious: ${results.malicious}`);
  console.log(`   Fetch failed: ${results.fetchFailed}`);
  console.log(`   Errors: ${results.error}`);
  console.log();
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 ugig.net Batch Security Scanner");
  console.log(`   Targets: ${[scanMcps && "MCP servers", scanSkills && "Skills"].filter(Boolean).join(" + ")}`);
  console.log(`   Mode: ${scanAllStatuses ? "rescan all" : "unscanned only"}${dryRun ? " [DRY RUN]" : ""}`);

  if (scanMcps) await scanMcpListings();
  if (scanSkills) await scanSkillListings();

  console.log("✅ Done!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
