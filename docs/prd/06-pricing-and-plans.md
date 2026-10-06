# PRD 06: Pricing and plan consistency

**Priority:** P1 | **Owner:** Anthony (decisions), then eng | **Status:** needs decisions

**Everything in this PRD is a money or pricing decision.** Engineering should not
change prices, fees or perks until Anthony picks the answers below. The audit only
records where the copy, the code and the billing providers disagree.

## Where they disagree

| Topic | Landing / for-employers | Stripe | CoinPay checkout | Docs |
|---|---|---|---|---|
| Pro monthly | $29/mo | $9/mo (one price ID, `src/lib/stripe/index.ts`) | $29/mo | features.md: $5.99/mo |
| Pro annual | "$9/month billed annually" | none | $108/yr, but the webhook grants only +1 month | none |
| Lifetime | $100 one-time | none | $100; the webhook may grant 1 month (PRD 05, bug 3) | none |
| Free posts | 10/month; for-employers:81 also says "Post unlimited gigs for free" | n/a | n/a | 10/month. **Never enforced:** the usage upsert resets the counter to 2 on every post (PRD 03) |

## What each plan actually gets

- **Lifetime is treated as Free.**
  - The dashboard checks only `plan === "pro"` (`src/app/dashboard/page.tsx`) and
    shows a lifetime member the 10-post limit.
  - Marketplace seller fees stay at the Free rate of 5% (`src/lib/skills/purchase.ts`
    and the mcp/prompts equivalents).
- **Pro perks are mostly missing.**
  - "Featured gig placement": Boost is free to everyone once a week.
  - "Featured profile badge": no badge exists.
  - "Advanced analytics": the stats page is free to everyone.
  - "Priority support": there is no support system.
- **Funding tiers.**
  - The $1 Supporter tier grants nothing.
  - "Founder badge" and "premium placement" don't exist.
  - API keys, listed as a perk, are free to everyone.
  - The $50 lifetime perk never fires (PRD 05, bug 1).
- **CoinPay Pro never expires.** Nothing checks `current_period_end`.
- **Fee disclosure.** Terms §5 says "All fees are disclosed before you complete a
  transaction", but:
  - the 5% escrow fee is shown only after the escrow is created;
  - the 2% zap fee and the 5%/2% marketplace fees are never shown before payment;
  - `src/lib/constants.ts` says withdrawals cost 2%, and none is charged.

## Decisions needed (Anthony)

1. What does Pro cost, monthly and annual, and on which rails (Stripe, CoinPay or
   both)? Should the providers match?
2. Is Lifetime still sold? If so, should it equal Pro everywhere: post cap,
   marketplace fee, badge?
3. Which Pro perks are real?
   - Build: badge, featured placement (Boost becomes Pro-only, or Pro gets an extra
     boost), analytics.
   - Or remove from the copy: priority support, analytics.
4. Funding perks: keep the $50 lifetime grant? What do Supporter and Founder get?
   Is there a badge?
5. Fees: confirm 5% escrow, 2% zap, 5%/2% marketplace, and 0% on withdrawals.
   Where are they disclosed before payment?
6. CoinPay Pro expiry: downgrade at `current_period_end` with a grace period, or
   not?

## Engineering work once decided (not before)

- A single plan/price source (`src/lib/plans.ts`) that the landing page, for-employers,
  the subscription page, Stripe, CoinPay and the docs all read.
- An `isPaidPlan(plan)` helper (pro or lifetime) used for every gate.
- Fee disclosure lines in each checkout UI, read from `constants.ts`.
- A plan-expiry cron for CoinPay Pro.
- Copy fixes (PRD 14).
