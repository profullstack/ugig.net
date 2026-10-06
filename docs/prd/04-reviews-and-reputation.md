# PRD 04: Reviews and reputation

**Priority:** P0 | **Owner:** eng | **Status:** proposed

## Problem

Prod, 2026-10-06: 2 reviews and 27 testimonials, against 1,702 accepted
applications and 267 paid invoices.

- **`ReviewForm` is never rendered.**
  `src/components/reviews/ReviewForm.tsx` is imported only by its own test. On the
  gig page, "Hired workers + Review" (`HiredWorkerReview.tsx`) posts to
  `/api/testimonials`, and only from poster to worker.
- **Ratings never show up.** Profile stars and the leaderboard read from `reviews`,
  which the web UI never writes, so a rating given on the web is invisible.
- **Nothing asks for a review.** No notification or email prompts anyone after a
  hire, a paid invoice or a fill. `testimonialReminderEmail` is sent only when an
  escrow is released, and that has never happened (0 escrows).
- **Statuses blocked reviews.**
  - `/api/reviews` required `status = accepted`, and escrow release or a paid
    invoice moves the application to `completed`.
  - Those writes failed until #586 added the enum values, so the bug was hidden.
  - #586 made reviews accept every hired status.
- **Verification is unreachable.** It needs 3 completed gigs, where "completed"
  means accepted on a `filled` gig, and nothing fills gigs (PRD 01).
  `verification_requests` (manual requests) has no admin review UI.
- **Duplicate notifications.** `/api/reviews` inserts `review_received`, and the
  `on_new_review` trigger also inserts `new_review`.

## Claims affected

- features.md: "Both parties rate 1-5 stars after completion". PARTIAL: the API
  exists but there is no UI.
- features.md: "Profile shows average rating". PARTIAL: it reads a table nobody
  writes.
- leaderboard: "ranked by completed gigs, ratings, endorsements". Every agent showed
  0 until #588.
- for-employers: "Verified Profiles". PARTIAL: verification is unreachable.

## Requirements

1. **One review model.**
   - Mount `ReviewForm` for both sides on `/gigs/[id]` and on the
     invoice-paid screen.
   - Keep testimonials as the public quote attached to a review, not a separate
     table the profile ignores. If that is too invasive, render testimonials'
     ratings in the profile average too.
2. **Ask at the right moment.** When an invoice is paid, an escrow is released, or a
   gig is filled, send each side an in-app "Rate @x" notification and one email.
   Remind once after 3 days, then stop.
3. **Verification that can happen.**
   - Count completed work as a hired application with at least one paid invoice
     **or** on a filled gig.
   - Build an admin queue for `verification_requests` (PRD 09).
4. **Remove the duplicate notification insert** in `/api/reviews` (PRD 08).
5. **Backfill opportunity.** The 267 paid invoices are 267 completed jobs with no
   review. A one-time "rate your past work" email per pair is optional and is
   Anthony's call (it emails users).

## Shipped in this audit

- #586: hired statuses (`accepted`, `in_progress`, `completed`, `paid`) count for
  reviews, verification, profiles and the leaderboard.
- #588: the leaderboard actually counts completed gigs and endorsements. It was 400
  plus RLS, which showed 0 for everyone.

## Acceptance

- Both parties see a review prompt after a paid invoice, and a submitted review
  shows on the reviewee's profile stars.
- Reviews per paid invoice is above 30% within a month.
- At least one user auto-verifies through the paid-invoice path.

## Open decisions (Anthony)

- Whether to merge testimonials into reviews, or show both.
- Whether to send the backfill "rate your past work" email.
