# PRD 05: Payment reliability (bugs only, no policy)

**Priority:** P0 | **Owner:** eng | **Status:** proposed

This PRD covers places where the code fails to do what it already says it does.
What things *cost* is PRD 06. Escrow behaviour is PRD 07.

## How money moves today (prod, 2026-10-06)

| Flow | Table | Rows | Status |
|---|---|---|---|
| Worker invoices poster, poster pays via CoinPay directly to the worker's linked wallet | `gig_invoices` | 652 | 267 paid ($450), 104 sent, 215 rejected, 66 cancelled |
| Pro / lifetime / funding / tip checkouts | `payments` | 10 | 4 forwarded (Mar), 6 pending (May-Aug), 0 confirmed |
| Crowdfunding | `funding_payments` | 13 | 10 paid, 2 confirmed, 1 forwarded |
| Lightning wallet: deposits, zaps, skill sales | `wallet_transactions` | 659 | 61 deposits stuck `pending` (255k sats) |
| Escrow | `gig_escrows` | 0 | never used |

- **Real gig payments come from one account.** All 267 paid invoices came from the
  founder account, paying 32 workers.
- **No invoice has been paid since 2026-08-11.**
  - 104 invoices sit in `sent`, the newest from 2026-09-25.
  - 20 of the 29 created since 2026-09-01 have no `coinpay_invoice_id`.
  - Likely the same cause as 2026-08-16, when ugig's CoinPay client lost the
    `wallet:read` scope and invoicing broke while the UI still said "Connected".
- **The daily email showed "0 confirmed payments"** because it counted the
  checkout table. Fixed in #589.

## Bugs

1. **The $50+ funding "Lifetime Premium" is never granted.**
   - Funding payments carry `metadata.type="funding"` (`src/lib/coinpay-client.ts`).
   - `handleFundingPaymentEvent` returns true, and the webhook breaks out
     (`src/app/api/payments/coinpayportal/webhook/route.ts` ~:57) before
     `handlePaymentConfirmed` can call `grantLifetimeForInvestment`.
   - `funding_rewards_log` has no writer on this path.
   - **Action:** grant the reward inside the funding handler, idempotently, and
     backfill any funder who paid $50 or more and has no lifetime plan. That is a
     data change, so dry-run first and get Anthony's OK.
2. **`forwarded` overwrites `confirmed`, and activation runs only on `confirmed`.**
   If CoinPay sends only `forwarded`, the purchase never activates. Treat
   `forwarded` as a superset of `confirmed` (activate when not already active), and
   merge metadata instead of replacing it (`handlePaymentForwarded`).
3. **Plan is lost between create and webhook.**
   - `coinpayportal/create` never stores `plan` in the local row's metadata, so the
     webhook falls back to monthly.
   - Lifetime buyers would get 1 month, and annual buyers get +1 month.
   - Latent today (0 subscription payments), but the Lifetime button is live.
4. **`payment.failed` is not mapped.** Rows stay `pending` forever. Map it to
   `failed`, and add an hourly job that marks `pending` rows older than their
   `expires_at` (or 24h) as `expired`. Clears the 6 stuck rows.
5. **The status poll can never write.** `payments/coinpayportal/status` updates with
   the user's client against a service-role-only RLS policy. Use the service client
   and map provider statuses to the enum.
6. **CoinPay disconnects silently.**
   - Before creating an invoice or payment request, verify that the worker's
     CoinPay grant has the scopes the flow needs.
   - On failure, show "Reconnect CoinPay" instead of creating an invoice with no
     `coinpay_invoice_id`.
   - Alert on any invoice created without one.
7. **Stuck Lightning deposits.** Add a reconcile job that re-checks pending
   deposits against LNbits and expires unpaid ones (61 rows).
8. **CLI `payments status <id>`** calls `GET /api/payments/coinpayportal/:id`, which
   doesn't exist. Point it at the status route.
9. **`affiliate-payouts` cron is not scheduled.** Nothing calls it. Scheduling it
   sends money, so it is listed here and **left for Anthony** (PRD 06).

## Acceptance

- Replaying a `payment.forwarded` with no prior `confirmed` activates the plan once.
- A $50 funding payment (test mode) sets `subscriptions.plan='lifetime'` and writes
  `funding_rewards_log`.
- No `payments` row is `pending` more than 24h after its expiry.
- Creating an invoice when the worker's CoinPay grant lacks a scope returns a clear
  error and creates no row.
- The newest `sent` invoice can be paid end to end (manual check with a $1 invoice).

## Open decisions (Anthony)

- Backfilling lifetime for past $50+ funders (bug 1). It changes entitlements.
- Whether to reschedule `affiliate-payouts` (bug 9). It moves money.
- What to do with the 104 `sent` invoices: remind posters, or expire them.
