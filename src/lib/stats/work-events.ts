import type { WorkEvent } from "./productivity";

/**
 * Turns paid invoices and paid bounty submissions into the flat
 * {@link WorkEvent} stream the stats page charts. Pure: the page does the
 * fetching, this does the interpretation.
 */

export interface StatsInvoiceItem {
  description: string | null;
  quantity: number | string | null;
  amount_usd: number | string | null;
}

export interface StatsInvoice {
  status: string | null;
  amount_usd: number | string | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: { paid_at?: string | null; category?: string | null } | null;
  gig?: { title: string | null } | null;
  items?: StatsInvoiceItem[] | null;
}

export interface StatsBountySubmission {
  payout_status: string | null;
  paid_at: string | null;
  updated_at?: string | null;
  created_at: string;
  bounty?: { title: string | null; payout_usd: number | string | null } | null;
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * `paid_at` is only written by the payment sync, so fall back through the row's
 * own timestamps rather than dropping an invoice out of the timeline.
 */
function paidAtOf(invoice: StatsInvoice): string {
  return invoice.metadata?.paid_at ?? invoice.updated_at ?? invoice.created_at;
}

export function invoiceToWorkEvents(invoice: StatsInvoice): WorkEvent[] {
  if (invoice.status !== "paid") return [];

  const total = num(invoice.amount_usd);
  const at = paidAtOf(invoice);
  const fallbackLabel =
    invoice.metadata?.category?.trim() ||
    invoice.gig?.title?.trim() ||
    "Uncategorized work";

  const items = (invoice.items ?? []).filter((i) => i != null);
  const itemsTotal = items.reduce((s, i) => s + num(i.amount_usd), 0);

  // The invoice total is what actually changed hands, so line items only split
  // it up — a drifted item sum can never make the page disagree with /invoices.
  if (items.length === 0 || itemsTotal <= 0) {
    return [{ at, costUsd: total, units: 1, label: fallbackLabel, source: "invoice" }];
  }

  return items.map((item) => {
    const share = num(item.amount_usd) / itemsTotal;
    const quantity = num(item.quantity);
    return {
      at,
      costUsd: total * share,
      units: quantity > 0 ? quantity : 1,
      label: item.description?.trim() || fallbackLabel,
      source: "invoice" as const,
    };
  });
}

export function bountyToWorkEvent(
  submission: StatsBountySubmission
): WorkEvent | null {
  if (submission.payout_status !== "paid") return null;

  const payout = num(submission.bounty?.payout_usd);
  if (payout <= 0) return null;

  return {
    at: submission.paid_at ?? submission.updated_at ?? submission.created_at,
    costUsd: payout,
    units: 1,
    label: submission.bounty?.title?.trim() || "Bounty",
    source: "bounty",
  };
}

export function toWorkEvents(
  invoices: StatsInvoice[],
  submissions: StatsBountySubmission[]
): WorkEvent[] {
  const events = invoices.flatMap(invoiceToWorkEvents);
  for (const s of submissions) {
    const event = bountyToWorkEvent(s);
    if (event) events.push(event);
  }
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
