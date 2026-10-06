# PRD 01: Gig lifecycle (filled, closed, expired)

**Priority:** P0 | **Owner:** eng | **Status:** proposed

## Problem

Prod, 2026-10-06: 0 of 1,944 gigs have ever been `filled`. 97 are `closed`.

- The only way to fill a gig is a menu item in `/dashboard/gigs`
  (`src/components/gigs/GigActions.tsx:176`) or `ugig gigs status --status filled`.
  The gig page's owner card has only `CloseGigButton`, and nothing ever prompts the
  poster to mark a gig filled.
- Nothing fills a gig on its own. Accepting an applicant, a paid invoice and a
  released escrow all leave it `active`.
  - 1,702 applications are accepted. 267 invoices are paid.
  - 22 active hiring gigs already have a hire and still show as open.
- Gigs never expire. There is no `expires_at` or deadline column and no cron job.
  304 gigs have been active for more than 90 days. `gigExpiredEmail`
  (`src/lib/email.ts`) exists but nothing calls it.
- Closing or deleting a gig leaves its applicants in limbo. 416 applications are
  `pending` on gigs that are closed, paused or draft. A delete cascades the
  applications away with no notice to anyone.
- `PUT /api/gigs/[id]` accepts `status` through `gigSchema`
  (`src/lib/validations.ts:138`). That skips the free-tier usage check and the
  gig-filled email that `PATCH /api/gigs/[id]/status` handles.
- **Downstream damage:** auto-verification needs 3 "accepted applications on filled
  gigs" (`src/lib/verification/check.ts`), so nobody can qualify. The profile's
  "Completed gigs" and the leaderboard used `accepted` only, until #586 and #588
  fixed that.

## Claims affected

- features.md: "Lifecycle draft/active/paused/closed/filled". The states exist, but
  in practice nobody reaches `filled`.
- for-employers: "Verified Profiles". Verification is unreachable because it
  depends on `filled`.

## Requirements

1. **Prompt to fill.** When a poster accepts an applicant on a `hiring` gig, show
   "Mark this gig filled?" in the UI and offer `--fill` on the CLI/API. Add
   "Mark as filled" to the owner card on `/gigs/[id]` next to Close.
2. **Auto-fill on payment** (behind a per-gig setting, default on for single-hire
   gigs): when an invoice on the gig is paid, or its escrow is released, and the
   gig is `active` with at least one hired applicant, set it to `filled`.
   - This needs a `positions` column (default 1) so multi-hire gigs stay open until
     `hired >= positions`.
3. **Expiry.** Add `gigs.expires_at`, defaulting to `created_at + N days` (see the
   open decision). A daily cron:
   - pauses expired `hiring` gigs,
   - emails the poster `gigExpiredEmail` with a one-click "renew 30 days" link,
   - leaves `for_hire` ads to PRD 03.
4. **Close/fill/delete resolves applicants.** On close or fill, every application
   still `pending`, `reviewing` or `shortlisted` becomes `rejected` with
   `metadata.reason = 'gig_closed' | 'gig_filled'`. The applicant gets one in-app
   notification (and email, subject to PRD 08). Delete becomes a soft delete (or is
   refused once anyone is hired), so applicants are told.
5. **One status path.** `PUT /api/gigs/[id]` must apply the same rules as
   `PATCH /api/gigs/[id]/status` when the body has `status`: usage check, emails,
   webhooks and requirement 4. Extract a shared `changeGigStatus()`. Don't simply
   strip the field, because the GigForm edit page sends `status` through PUT.
6. **Backfill.** Once requirements 1-5 ship, run a one-off script that:
   - marks a gig `filled` when it is `active`, `listing_type=hiring`, has a paid
     invoice, and has had no new applications for 30 days;
   - closes the 416 stranded pending applications on non-active gigs, with a
     dry-run report first.

## Acceptance

- Accepting an applicant shows the fill prompt. Filling rejects the remaining open
  applications and notifies each applicant once.
- A gig whose only hire has a paid invoice reaches `filled` with no poster action
  (when auto-fill is on).
- A gig older than its `expires_at` stops appearing in `/gigs`, and the poster gets
  exactly one email.
- `PUT /api/gigs/[id]` with `{status}` returns 400 (or ignores the field).
- Daily stats "Filled" is greater than 0 within a week of shipping.

## Metrics

- Fill rate = filled / (filled + closed + expired) for `hiring` gigs.
- Median days from post to first hire.
- Pending applications on non-active gigs: target 0.

## Open decisions (Anthony)

- The expiry window N (suggest 30 days for hiring gigs).
- Whether auto-fill-on-payment defaults on.
- Whether a delete with hired applicants is refused or archived.
