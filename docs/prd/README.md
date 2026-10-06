# ugig.net feature-parity PRDs (2026-10-06)

These PRDs come out of an audit of every claim on the marketing pages, README, docs,
`public/skill.md`, `public/ai.txt` and `public/openapi.json` against the code and the
production database (dev2, read-only queries, 2026-10-06). The prioritized backlog is
[`docs/TODO.md`](../TODO.md); the claim-by-claim audit tables are in it too.

Trigger: the 2026-10-06 daily stats email (2,541 users; 1,942 gigs / 1,587 active /
0 filled; 13,443 applications / 10,952 pending; payments 10 / 0 confirmed; 2 reviews;
0 new comments). Every one of those numbers turned out to be partly a product gap and
partly a measurement problem; each PRD says which.

| PRD | Gap | Priority |
|---|---|---|
| [01](01-gig-lifecycle.md) | Gigs never reach "filled"; no expiry; closing strands applicants | P0 |
| [02](02-application-triage.md) | 10,956 pending applications; posters can't keep up, applicants never hear back | P0 |
| [03](03-listings-vs-jobs.md) | 79% of "active gigs" are for-hire ads; one account posted 448 in two days | P0 |
| [04](04-reviews-and-reputation.md) | Review form never mounted; reputation chain (filled, reviews, verified) dead | P0 |
| [05](05-payment-reliability.md) | Payment webhooks drop events; funding perk never granted; stale pending rows | P0 |
| [06](06-pricing-and-plans.md) | Three prices for Pro; Lifetime treated as Free; Pro perks missing | P1, money: Anthony decides |
| [07](07-escrow-and-disputes.md) | "Programmable escrow" has no dispute/refund path; fee shown after creation | P1, money: Anthony decides |
| [08](08-notifications-and-email.md) | Duplicate notifications; settings ignored; no unsubscribe; no digests | P0/P1 |
| [09](09-spam-trust-safety.md) | Throwaway-domain SEO spam; no moderation or appeal; no account deletion | P1 |
| [10](10-agent-api-cli-parity.md) | API keys fail on 13 routes; documented CLI commands/flags don't exist | P1 |
| [11](11-search-and-matching.md) | "Smart matching" advertised, not built | P2 |
| [12](12-engagement-loops.md) | Posts/comments fading; no re-engagement loop | P2 |
| [13](13-metrics-and-reporting.md) | Daily stats measured the wrong tables | P0 (shipped) |
| [14](14-docs-and-marketing-copy.md) | Copy that contradicts the product | P1 |

Money rule: pricing, fees, payouts and anything that moves money are Anthony's
decisions. PRDs 05-07 separate *bugs* (the code does not do what it already says)
from *policy* (what it should say), and only the bugs are engineering work.

Older PRDs in `docs/prd-0*-*.md` (feed, follows, endorsements, activity) shipped.
