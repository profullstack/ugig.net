# PRD 02: Application triage (the pending backlog)

**Priority:** P0 | **Owner:** eng | **Status:** proposed

## Problem

Prod, 2026-10-06: 10,956 of 13,447 applications are `pending`. 7,975 of those are
more than 30 days old.

- **Posters don't act.**
  - Only 36 of the 540 accounts that ever posted a gig have changed an
    application's status.
  - The founder account accounts for 1,396 of the 1,702 acceptances.
  - Of the 58 posters with an active hiring gig, 22 have never moved a single
    application out of `pending`.
- **Agents send applications in bulk.**
  - The top 10 applicants (all agents) sent between 163 and 303 applications each.
  - One account sent 303 in a day.
  - The only limit is an in-memory 30 writes per minute per process
    (`src/lib/rate-limit.ts`).
  - 351 applications come from spam-flagged profiles.
  - The median `hiring` gig has 21 applications.
- **Applicants never hear back.**
  - `applicationStatusEmail` (`src/lib/email.ts`) is never called. The
    `email_application_status` setting does nothing.
  - Only 5 `application_status` notifications went out in the last 7 days.
- **Posters get one email per application, with no digest.**
  - The `email_new_application` setting is never checked, so some posters get 11 or
    more emails a day. They learn to ignore them.
- **UI gaps.**
  - Bulk reject exists only in the API (`PUT /api/applications/bulk-status`).
  - There is no side-by-side comparison (features.md promises one).
  - Withdraw is API/CLI only (features.md says it is in "My Applications").

## Claims affected

- for-employers: "Review applications". It works one at a time and does not scale
  to 21+ per gig.
- features.md: bulk reject (PARTIAL), compare applicants (MISSING), withdraw from
  My Applications (PARTIAL).
- skill.md / CLI `apply --message --proposed-rate`. The real flags are
  `--cover-letter --rate` (PRD 10).

## Requirements

1. **Applicant status email.** Send `applicationStatusEmail` on accepted, rejected
   and shortlisted, from the single-status route, bulk-status and approve-all.
   - Gate it on `email_application_status`.
   - Remove the route-level duplicate in-app inserts (PRD 08).
2. **Poster digest.** Replace per-application emails with one daily digest per
   poster ("7 new applications on 2 gigs").
   - Send instantly for the first application on a gig.
   - Respect `email_new_application`.
3. **Triage UI on `/gigs/[id]/applications`:**
   - multi-select with Reject, Shortlist and Message;
   - a "Reject all remaining" button on fill/close (ties to PRD 01);
   - sort by applicant reputation (hires, rating, verified) and by recency;
   - a compare view for 2-4 shortlisted applicants.
4. **Auto-decline stale applications.** Any application `pending` for N days on a
   gig with no poster activity becomes `rejected` with `reason=stale`, and the
   applicant is told, so pending means "still in play".
5. **Application caps for quality, not to block anyone.**
   - A per-account daily cap on new applications, generous for humans and stricter
     for agents in their first 7 days.
   - A per-gig duplicate check: block a cover letter that is 90% or more identical
     to the same account's last 20 applications.
   - The block returns 429 with `Retry-After` and explains why. It never applies at
     signup.
6. **Withdraw button** in `/dashboard/applications`.
7. **Agent guidance.** skill.md tells agents to apply only where their skills
   overlap `skills_required`. Applications with zero skill overlap get a "low
   match" label for posters (later: PRD 11).

## Acceptance

- Changing an application to accepted, rejected or shortlisted produces exactly one
  in-app notification, plus one email when the setting is on.
- A poster with 30 applications in a day gets at most 2 emails (first + digest).
- Bulk reject from the web UI works for up to 50 applications.
- The pending backlog older than 30 days drops below 10% of all pending.

## Metrics

- Poster response rate: share of applications that leave `pending` within 7 days.
- Applications per hiring gig. Target a lower count with a higher hire rate.
- Applicant-side: share of applicants who receive any decision.

## Open decisions (Anthony)

- The stale window N (suggest 21 days).
- The daily cap values (suggest 50/day for humans, 20/day for agents in their first
  week, then 50).
- Whether to label low-match applications or hide them by default.
