# Bulk invoice payments

Pay every accepted invoice in one confirmation, using the CoinPay wallet
browser extension.

**The problem:** the Accepted queue on `/dashboard/invoices?tab=received` needs
each invoice paid individually — create a payment request, copy the address,
send from a wallet, wait. At 62 accepted invoices that is about an hour.

**The fix:** prepare all payment requests server-side, hand the whole list to the
extension, approve once, and let it broadcast while the dashboard streams
progress.

## Flow

1. **`BulkPayAccepted`** (client component on the invoices page) detects
   `window.coinpay`. Without the extension it shows an install link instead.
2. **`POST /api/invoices/bulk-payment-request`** — takes the accepted invoice
   ids and mints (or reuses) a live CoinPay payment request for each. Returns
   `payments` shaped for `payBatch`, plus a `skipped` list explaining every
   invoice that could not be prepared.
3. The user reviews the summary, then **`window.coinpay.payBatch(payments)`**
   opens the wallet's approval window — one approval for the whole list.
4. The extension signs and broadcasts each payment, streaming progress back.
5. **`POST /api/invoices/bulk-payment-record`** stores the resulting transaction
   hashes (or errors) on each invoice.

## What marks an invoice paid

**Not this feature.** A broadcast transaction is a claim, not a settlement — it
can still be dropped or replaced. The record endpoint writes
`metadata.payer_tx_hash` and sets `coinpay_status: "broadcast"`, and nothing
more.

Invoices flip to `paid` only through the existing CoinPay webhook and
`syncGigInvoicePaymentStatus`, which watch the deposit address. Trusting the
payer's self-reported hash here would let anyone flip their own invoice to paid.

The practical benefit of recording anyway: a payment that broadcast but has not
confirmed becomes distinguishable from one that was never sent — the difference
between "wait" and "pay again".

## Eligibility

`bulk-payment-request` only prepares an invoice when all of these hold, and
reports a reason for every one it skips:

| Requirement | Skip reason |
|---|---|
| Caller is `poster_id` | `Not found, or you are not the payer` |
| Status is `sent` or `expired` | `Invoice is <status>` / `Already paid` |
| `metadata.accepted_at` is set | `Not accepted yet` |
| Worker has a CoinPay receiving wallet | `…missing the worker's CoinPay receiving wallet` |
| CoinPay quotes a crypto amount | `CoinPay did not quote a crypto amount` |

Every requested id lands in exactly one of `payments` or `skipped` — an invoice
missing from both would silently look paid.

Accepting stays a deliberate per-invoice decision; bulk pay is the *Accepted*
queue's action, not a way to skip review.

## Idempotency

`ensureInvoicePaymentRequest` reuses an existing request while its quote is
unexpired, and re-quotes otherwise. This matters on retry: without reuse, a
second run would mint a second deposit address for the same debt, leaving two
live addresses one worker could be paid at twice.

Shared with the single-invoice route (`/api/gigs/[id]/invoice/[invoiceId]/
payment-request`) so both paths produce byte-identical requests — two
implementations here would eventually disagree about what "paid" means.

## Partial success

Each payment is a separate on-chain transaction, so some can fail while others
succeed. That is normal, not an error state:

- `payBatch` resolves with per-item `status`; it is not all-or-nothing.
- Failures are listed by name with their reason and a **Retry the N that failed**
  button, which re-prepares only those ids.
- Results are recorded even when the batch partly failed.

## Timing

Payment-request quotes hold ~15 minutes, and the wallet serializes payments per
account (see `docs/BULK_PAYMENTS.md` in the coinpayportal repo for why). Roughly
4s per payment on EVM/Solana, ~10s on Bitcoin.

62 USDC payments ≈ 4 minutes — comfortably inside the window. A large
single-chain **Bitcoin** run can approach it; prefer USDC/SOL rails for payables,
or split very large BTC runs.

The UI tells the user to keep the approval window open: closing it cancels the
payments that have not gone out yet.

## Files

| Path | Role |
|---|---|
| `src/lib/invoices/payment-request.ts` | Shared request creation + reuse |
| `src/app/api/invoices/bulk-payment-request/route.ts` | Prepare many at once |
| `src/app/api/invoices/bulk-payment-record/route.ts` | Record broadcast hashes |
| `src/app/dashboard/invoices/BulkPayAccepted.tsx` | Panel, confirm, live progress |
| `src/types/coinpay-extension.d.ts` | `window.coinpay` typings |

The wallet side lives in `profullstack/coinpayportal` under
`packages/extension` — see `docs/BULK_PAYMENTS.md` there.
