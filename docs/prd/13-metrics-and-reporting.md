# PRD 13: Metrics and reporting

**Priority:** P0 (shipped in #589) / P1 (funnel) | **Owner:** eng

## Problem

The daily stats email (`src/lib/daily-stats.ts`) measured tables that don't answer
the questions it seemed to:

| Line in the email | What it actually counted | What was missing |
|---|---|---|
| Payments 10 / 0 confirmed | `payments`: $1 Pro/funding/tip checkouts | `gig_invoices`, where gig money moves (267 paid) |
| 1,587 active gigs | jobs and for-hire ads together | only 335 are jobs (PRD 03) |
| 0 filled | real, but nothing sets `filled` (PRD 01) | closed count, hires |
| 13,443 applications / 10,952 pending | correct | that most pending are stale on abandoned gigs (PRD 02) |
| 2,541 users | correct | about half of last month's human signups are throwaway-domain spam (PRD 09) |

## Shipped (#589)

- New "Gig invoices" section: total, paid (+24h), awaiting payment, new.
- `payments` relabelled "Pro / funding / tip checkouts".
- Active gigs split into jobs and for-hire ads. Closed gigs added.
- "Hired" applications: accepted + in_progress + completed + paid.
- Spam-flagged profile count.

## Next (P1)

1. **A weekly funnel in the same email:**
   - jobs posted, then jobs with 1 or more applications, then jobs with a hire,
     then jobs with a paid invoice, then filled;
   - median time per step.
2. **Payers.** Distinct payers in the last 30 days. Today it is 1, the founder
   account; that is the single most important health number.
3. **Real-user signups.** New signups minus spam-flagged, and humans vs agents.
4. **Invoice health.** Invoices created without a `coinpay_invoice_id` in the last
   24h (alert if more than 0, PRD 05).
5. **Store a daily snapshot.** Write each day's numbers to a `daily_stats` table so
   trends don't depend on reading old emails.
