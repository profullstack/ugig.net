#!/usr/bin/env npx tsx
/**
 * Backfill on-chain transaction hashes onto settled gig invoices and bounty
 * payouts.
 *
 * Why this exists: payments settled through the CoinPay status-polling path
 * (`syncGigInvoicePaymentStatus` / `syncBountyPaymentStatus`) recorded
 * `tx_hash: null`, because CoinPay's public `GET /api/payments/{id}` withheld
 * `tx_hash` and `forward_tx_hash`. CoinPay always had both. The public endpoint
 * now returns them, so new settlements are fine — but everything paid before
 * that fix carries a null hash and shows no receipt to either party. This
 * copies the hashes, and the settlement chain, across for those rows.
 *
 * Reads CoinPay's database directly rather than its API: the affected rows are
 * already `paid`, so the sync path early-returns and would never re-fetch them.
 *
 * Safe to re-run — it only fills gaps, and skips rows that are already whole.
 * Dry run by default — pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/backfill-payment-tx-hashes.ts            # report only
 *   npx tsx scripts/backfill-payment-tx-hashes.ts --apply    # write
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ugig) and
 * COINPAY_SUPABASE_URL, COINPAY_SUPABASE_SERVICE_ROLE_KEY (CoinPay).
 */

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const UGIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const UGIG_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COINPAY_URL = process.env.COINPAY_SUPABASE_URL!;
const COINPAY_KEY = process.env.COINPAY_SUPABASE_SERVICE_ROLE_KEY!;

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: UGIG_URL,
  SUPABASE_SERVICE_ROLE_KEY: UGIG_KEY,
  COINPAY_SUPABASE_URL: COINPAY_URL,
  COINPAY_SUPABASE_SERVICE_ROLE_KEY: COINPAY_KEY,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const ugig = createClient(UGIG_URL, UGIG_KEY);
const coinpay = createClient(COINPAY_URL, COINPAY_KEY);

/** PostgREST caps a single response at 1000 rows; page rather than truncate. */
const PAGE = 500;

interface SettledRow {
  id: string;
  coinpay_invoice_id: string | null;
  metadata: Record<string, unknown> | null;
}

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/**
 * A hash with no chain is unlinkable, so a row missing either one still needs
 * work — that includes rows an earlier run already gave hashes to.
 */
function needsBackfill(metadata: Record<string, unknown> | null): boolean {
  return (
    (blank(metadata?.tx_hash) && blank(metadata?.merchant_tx_hash)) ||
    blank(metadata?.settlement_chain)
  );
}

/** The two tables that settle through CoinPay, with their status columns. */
const TARGETS = [
  { table: "gig_invoices", statusColumn: "status", paidValue: "paid", label: "gig invoices" },
  {
    table: "bounty_submissions",
    statusColumn: "payout_status",
    paidValue: "paid",
    label: "bounty payouts",
  },
] as const;

type Target = (typeof TARGETS)[number];

async function fetchSettledRows(target: Target): Promise<SettledRow[]> {
  const rows: SettledRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ugig
      .from(target.table)
      .select("id, coinpay_invoice_id, metadata")
      .eq(target.statusColumn, target.paidValue)
      .not("coinpay_invoice_id", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to read ${target.table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as SettledRow[]));
    if (data.length < PAGE) break;
  }
  return rows.filter((row) => needsBackfill(row.metadata));
}

interface PaymentRow {
  tx_hash: string | null;
  forward_tx_hash: string | null;
  /** The chain, which `payment_currency` does not carry (it holds "USD"). */
  chain: string | null;
}

async function fetchPayments(ids: string[]) {
  const byId = new Map<string, PaymentRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await coinpay
      .from("payments")
      .select("id, tx_hash, forward_tx_hash, blockchain, crypto_currency")
      .in("id", chunk);

    if (error) throw new Error(`Failed to read CoinPay payments: ${error.message}`);
    for (const row of data || []) {
      byId.set((row as any).id, {
        tx_hash: (row as any).tx_hash ?? null,
        forward_tx_hash: (row as any).forward_tx_hash ?? null,
        chain: (row as any).blockchain ?? (row as any).crypto_currency ?? null,
      });
    }
  }
  return byId;
}

async function backfill(target: Target): Promise<void> {
  const rows = await fetchSettledRows(target);
  console.log(
    `\n${target.label}: ${rows.length} settled row(s) missing a transaction hash or settlement chain`
  );
  if (rows.length === 0) return;

  const payments = await fetchPayments(rows.map((row) => row.coinpay_invoice_id!).filter(Boolean));

  let updated = 0;
  let unmatched = 0;
  let nothingUpstream = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const payment = payments.get(row.coinpay_invoice_id!);
    if (!payment) {
      unmatched++;
      continue;
    }
    if (!payment.tx_hash && !payment.forward_tx_hash && !payment.chain) {
      nothingUpstream++;
      continue;
    }

    const metadata = {
      ...(row.metadata || {}),
      // Only fill gaps. A hash already recorded came from the webhook, which
      // has the same authority as CoinPay's own row.
      tx_hash: (row.metadata?.tx_hash as string | null) || payment.tx_hash,
      merchant_tx_hash:
        (row.metadata?.merchant_tx_hash as string | null) || payment.forward_tx_hash,
      // Without this the hashes are unlinkable: `payment_currency` holds the
      // invoice currency ("USD"), which resolves to no block explorer.
      settlement_chain: (row.metadata?.settlement_chain as string | null) || payment.chain,
      tx_backfilled_at: new Date().toISOString(),
    };

    if (!APPLY) {
      updated++;
      continue;
    }

    const { error } = await ugig
      .from(target.table)
      .update({ metadata } as never)
      .eq("id", row.id);

    if (error) {
      failures.push(`${row.id}: ${error.message}`);
      continue;
    }
    updated++;
  }

  console.log(`  ${APPLY ? "Updated" : "Would update"}: ${updated}`);
  if (unmatched) console.log(`  No matching CoinPay payment: ${unmatched}`);
  if (nothingUpstream) console.log(`  CoinPay has no hash or chain either: ${nothingUpstream}`);
  if (failures.length) {
    console.log(`  Failed: ${failures.length}`);
    for (const failure of failures) console.log(`    ${failure}`);
  }
}

async function main() {
  for (const target of TARGETS) {
    await backfill(target);
  }
  if (!APPLY) console.log("\nDry run. Re-run with --apply to write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
