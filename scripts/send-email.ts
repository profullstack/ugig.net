#!/usr/bin/env npx tsx

/**
 * Email CLI Tool for ugig.net
 *
 * Usage:
 *   npx tsx scripts/send-email.ts reminder --template profile-incomplete [--dry-run] [--include-spam]
 *   npx tsx scripts/send-email.ts send --template welcome --to user@example.com --username "John"
 *   npx tsx scripts/send-email.ts templates
 *
 * Env vars:
 *   RESEND_API_KEY          — Resend API key
 *   EMAIL_FROM              — Sender email (default: support@ugig.net)
 *   EMAIL_FROM_NAME         — Sender name (default: Ugig Support)
 *   NEXT_PUBLIC_APP_URL     — App URL for links (default: https://ugig.net)
 *   SUPABASE_ACCESS_TOKEN   — Supabase Management API token (for reminder queries)
 */

import { Resend } from "resend";
import "dotenv/config";
import { readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  /** Email subject line */
  subject: string;
  /** HTML body generator. Receives vars like { username, email, ... } */
  html: (vars: Record<string, string>) => string;
  /** SQL query for the `reminder` command (fetches users to email) */
  query?: string;
  /** Usernames to always exclude from bulk sends */
  excludeUsernames?: string[];
}

// ── Config ─────────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "support@ugig.net";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Ugig Support";
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_ID = "ojgvudxovrbdikzyoeex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, "email-templates");

// ── Spam Detection ─────────────────────────────────────────────────────────

const DISPOSABLE_DOMAIN_PATTERNS = [
  /@1200b\.com$/,
  /@tomorjerry\.com$/,
  /@aolmate\.com$/,
  /@privacymart\.org$/,
];

function isLikelySpam(email: string, username: string): boolean {
  // Ridiculously long local parts
  if (/^.{20,}@/.test(email)) return true;
  // Known disposable/spam domains
  if (DISPOSABLE_DOMAIN_PATTERNS.some((p) => p.test(email))) return true;
  // Random-looking usernames (20+ chars, all alpha)
  if (/^[A-Za-z]{20,}$/.test(username)) return true;
  return false;
}

// ── Template Loader ────────────────────────────────────────────────────────

async function loadTemplate(name: string): Promise<EmailTemplate> {
  const path = join(TEMPLATES_DIR, `${name}.ts`);
  try {
    const mod = await import(path);
    return mod.default as EmailTemplate;
  } catch {
    console.error(`❌ Template "${name}" not found at ${path}`);
    process.exit(1);
  }
}

function listTemplateNames(): string[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => basename(f, ".ts"));
}

// ── Supabase Query ─────────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  username: string;
  full_name: string | null;
  created_at: string;
  email: string;
}

async function queryProfiles(sql: string): Promise<ProfileRow[]> {
  if (!SUPABASE_ACCESS_TOKEN) {
    console.error("❌ SUPABASE_ACCESS_TOKEN is required for reminder queries");
    process.exit(1);
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!res.ok) {
    console.error(`❌ Supabase query failed: ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(body);
    process.exit(1);
  }

  return res.json();
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmdTemplates() {
  const names = listTemplateNames();
  console.log("📋 Available email templates:\n");
  for (const name of names) {
    const t = await loadTemplate(name);
    console.log(`  • ${name}`);
    console.log(`    Subject: ${t.subject}`);
    console.log(`    Has query: ${t.query ? "yes" : "no"}`);
    console.log();
  }
}

async function cmdSend(args: string[]) {
  const templateName = getFlag(args, "--template");
  const to = getFlag(args, "--to");
  const username = getFlag(args, "--username") || "there";

  if (!templateName) fatal("--template is required");
  if (!to) fatal("--to is required");
  if (!RESEND_API_KEY) fatal("RESEND_API_KEY env var is required");

  const template = await loadTemplate(templateName);
  const resend = new Resend(RESEND_API_KEY);

  console.log(`📧 Sending "${template.subject}" to ${to}...`);

  const { data, error } = await resend.emails.send({
    from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
    to,
    subject: template.subject,
    html: template.html({ username, email: to }),
  });

  if (error) {
    console.error(`❌ Failed:`, error);
    process.exit(1);
  }

  console.log(`✅ Sent! ID: ${data?.id}`);
}

async function cmdReminder(args: string[]) {
  const templateName = getFlag(args, "--template");
  const dryRun = args.includes("--dry-run");
  const includeSpam = args.includes("--include-spam");

  if (!templateName) fatal("--template is required");
  if (!RESEND_API_KEY && !dryRun) fatal("RESEND_API_KEY env var is required");

  const template = await loadTemplate(templateName);

  if (!template.query) {
    fatal(`Template "${templateName}" has no query defined — can't be used with reminder command`);
  }

  console.log(`🔍 Querying users for template "${templateName}"...`);
  const profiles = await queryProfiles(template.query);
  console.log(`   Found ${profiles.length} matching profiles\n`);

  const resend = dryRun ? null : new Resend(RESEND_API_KEY!);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    const { username, email } = profile;

    // Exclude specific usernames (agent accounts, bots, etc.)
    if (template.excludeUsernames?.includes(username)) {
      console.log(`⏭️  SKIP (excluded): ${username}`);
      skipped++;
      continue;
    }

    // Spam filtering (unless --include-spam)
    if (!includeSpam && isLikelySpam(email, username)) {
      console.log(`⏭️  SKIP (spam): ${username} <${email}>`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`📧 DRY RUN: Would email ${username} <${email}>`);
      sent++;
      continue;
    }

    try {
      await resend!.emails.send({
        from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
        to: email,
        subject: template.subject,
        html: template.html({ username, email }),
      });
      console.log(`✅ Sent: ${username} <${email}>`);
      sent++;

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      console.error(`❌ Failed: ${username} <${email}> — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Sent: ${sent}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${profiles.length}`);
  if (dryRun) console.log(`\n(Dry run — no emails were actually sent)`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function fatal(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function printUsage() {
  console.log(`
ugig.net Email CLI

Usage:
  npx tsx scripts/send-email.ts <command> [options]

Commands:
  templates                          List available email templates
  send     --template <name>         Send a single email
           --to <email>
           [--username <name>]
  reminder --template <name>         Bulk send to users matching template query
           [--dry-run]
           [--include-spam]

Examples:
  npx tsx scripts/send-email.ts templates
  npx tsx scripts/send-email.ts send --template welcome --to user@example.com --username "John"
  npx tsx scripts/send-email.ts reminder --template profile-incomplete --dry-run
  npx tsx scripts/send-email.ts reminder --template profile-incomplete
`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "templates":
      await cmdTemplates();
      break;
    case "send":
      await cmdSend(args.slice(1));
      break;
    case "reminder":
      await cmdReminder(args.slice(1));
      break;
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
