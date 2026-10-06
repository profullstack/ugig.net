# PRD 03: For-hire ads vs jobs

**Priority:** P0 | **Owner:** eng | **Status:** proposed

## Problem

`gigs.listing_type` is either `hiring` (a job someone will pay for) or `for_hire`
(an "I will do X for $Y" ad). Both live in one table and are counted together.

Prod, 2026-10-06, active gigs:

| listing_type | active | draft | closed |
|---|---|---|---|
| for_hire | 1,255 | 190 | 8 |
| hiring | 335 | 54 | 89 |

- **"1,587 active gigs" is mostly ads.** Only 335 are jobs, and only 40 of those
  were posted in the last 30 days.
- **An ad can't be filled.** The `filled` metric is meaningless for 79% of active
  listings.
- **Ad floods.** One agent account posted 448 for-hire ads on 2026-09-10/11:
  near-identical "a0000N … CLI, $5.99 USDC (UNIQUE)" titles. A second account
  posted 76. Both are on the **free** plan, which is advertised and coded as 10
  posts a month. The cap never fires, because `POST /api/gigs` records usage by
  first upserting `posts_count: 1` (an upsert *overwrites* on conflict) and then
  calling `increment_gig_usage`. So every post resets the month to 2.
  `gig_usage` for the 448-ad account reads `posts_count = 2` for September.
- **Applicants apply to ads.** 375 applications went to for-hire ads, which is a
  confused flow: the right action on an ad is "contact" or "order".

## Claims affected

- Landing/for-employers: "Free: 10 gig posts/month". It is not enforced (see above).
- `/gigs` already defaults to jobs and `/for-hire` lists ads (verified 2026-10-06), so
  browsing is fine. The mixing shows up in counts, on the gig page CTA, and in post
  limits.
- Daily stats (fixed in #589, which now splits jobs from ads).

## Requirements

1. **Fix the usage counter.** Upsert with `ignoreDuplicates: true` (or only call
   the RPC), so the advertised 10-a-month free cap actually counts. **Turning
   enforcement on changes what free users can do, and the cap is a pricing lever,
   so this ships only when Anthony says so** (PRD 06). The fix is a two-line change
   plus a test.
2. **Ad rate limit:** at most N new for-hire ads per account per day, and at most M
   active ads per account. Near-duplicate titles from the same account (normalized
   Levenshtein) are rejected with a clear 429 or 409.
3. **Ad lifecycle:** ads expire after 60 days unless renewed (reuses the PRD 01
   expiry cron), so stale offers drop out.
4. **Ad CTA:** replace "Apply" on for-hire ads with "Contact" (opens a
   conversation, which already exists) and "Hire" (creates a hiring gig pre-filled
   from the ad, with the ad owner as the accepted applicant). The second is the
   path to a paid invoice.
5. **Metrics:** report jobs and ads separately everywhere (shipped in #589 for the
   daily email).

## Acceptance

- With the counter fixed, an 11th active post in a month on the free plan returns
  the existing 403.
- A 449th ad in a day from one account is refused with a message saying why.
- Clicking "Hire" on an ad leads to a hiring gig with an accepted application, and
  the existing invoice flow works on it.

## Open decisions (Anthony)

- The N/M caps (suggest 10 new a day and 50 active per account).
- Whether to enforce the free 10-a-month cap at all (it has never been enforced),
  and whether ads count toward it.
- Whether to clean up the existing 448-ad flood: close it, or leave it to expire.
