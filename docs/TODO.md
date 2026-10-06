# ugig.net TODO: feature parity with what we claim

Audit date 2026-10-06. Sources:

- every claim on `src/app/page.tsx`, for-employers, for-candidates, about, investors,
  funding, affiliates, leaderboard, terms and privacy;
- `README.md`, `docs/features.md`, `public/skill.md`, `public/ai.txt`,
  `public/humans.txt`, `public/openapi.json`, `/docs`, `/docs/cli`;
- read-only queries on the production database (dev2).

The PRDs are in [`docs/prd/`](prd/README.md).

Legend: **[$]** marks money, pricing or fees, which are Anthony's decisions. ✅ means
shipped in this audit.

## Shipped in this audit

- ✅ **#586:** `application_status` enum gains `in_progress` / `completed` / `paid`.
  - Since March, "Mark In Progress / Completed / Paid" returned 400, and the escrow
    and paid-invoice webhook writes silently failed.
  - Every "was this person hired?" check now accepts all four statuses.
  - Migration applied on dev2.
- ✅ **#587:** spam-flagged profiles are noindexed, their bio is kept out of meta/OG
  tags, and they are dropped from the sitemap. Signup is unchanged.
- ✅ **#588:** the leaderboard showed 0 completed gigs and 0 endorsements for every
  agent. The cause was a 25 KB `.in()` that returned 400, plus RLS for logged-out
  viewers.
- ✅ **#589:** the daily stats email now reports gig invoices (the real money), jobs
  vs for-hire ads, closed gigs, hires and spam-flagged profiles.

## P0: core loop (post, apply, hire, pay, review)

| # | Task | PRD | Size |
|---|---|---|---|
| 1 | Remove the route-level duplicate notification inserts (applications status and bulk-status, reviews); triggers own them | 08 | S |
| 2 | Email applicants on accepted/rejected/shortlisted (`applicationStatusEmail`, gated on `email_application_status`) | 02, 08 | S |
| 3 | Gate new-application emails on `email_new_application`; build a daily poster digest | 02, 08 | M |
| 4 | Mount `ReviewForm` for both sides on `/gigs/[id]`; prompt for a review on invoice paid, escrow release and fill | 04 | M |
| 5 | "Mark as filled" on the gig-page owner card, plus a fill prompt after accepting an applicant | 01 | S |
| 6 | Close, fill or delete resolves open applications (reject with a reason, notify once). Backfill the 416 stranded ones | 01 | M |
| 7 | Strip `status` from `PUT /api/gigs/[id]` | 01 | S |
| 8 | Gig expiry: `expires_at` plus a daily cron plus `gigExpiredEmail` with renew | 01 | M |
| 9 | Triage UI: multi-select reject/shortlist, "reject all remaining", sort by reputation | 02 | M |
| 10 | Payment webhook bugs: funding events skip the lifetime grant; `forwarded` without `confirmed` never activates; plan lost between create and webhook; `payment.failed` unmapped; pending never expires; status poll can't write | 05 | M |
| 11 | Check the CoinPay scope before creating an invoice. 20 of the 29 invoices since 2026-09-01 have no `coinpay_invoice_id`; none paid since 2026-08-11 | 05 | M |
| 12 | Count completed work = hired application with a paid invoice OR on a filled gig (verification, profile) | 04 | S |

## P1

| # | Task | PRD | Size |
|---|---|---|---|
| 13 | **[$] DECISION:** enforce the free 10-a-month post cap? It was never enforced: the usage upsert resets the counter to 2 on every post. Ready fix: `ignoreDuplicates` | 03, 06 | S |
| 14 | For-hire ads: per-account daily/active caps and near-duplicate title check (one account posted 448 in two days) | 03 | M |
| 15 | For-hire ad CTA: Contact / Hire (pre-filled hiring gig) instead of Apply | 03 | M |
| 16 | Application quality: per-account daily cap, near-duplicate cover-letter check (429 with a reason) | 02 | M |
| 17 | Auto-decline applications that are stale for N days | 02 | S |
| 18 | One-click unsubscribe and `List-Unsubscribe` on all non-transactional email | 08 | M |
| 19 | Honour all 10 notification settings | 08 | S |
| 20 | Admin moderation queue: flagged users, not-spam/spam, gig takedown, verification requests, appeals | 09 | L |
| 21 | Quarantine (hold) gigs and applications from flagged accounts; never block at signup | 09 | M |
| 22 | Account deletion (privacy page promises it) | 09 | M |
| 23 | API keys on the 13 cookie-only routes | 10 | M |
| 24 | Fix skill.md flags, sorts and method; generate `/docs/cli` from commander; add aliases | 10 | M |
| 25 | `/llms.txt` | 10 | S |
| 26 | openapi coverage for agent-relevant routes, plus a CI check | 10 | M |
| 27 | Shared-store rate limits with `X-RateLimit-*` headers on every API response | 10 | M |
| 28 | Lightning deposit reconcile (61 pending) | 05 | S |
| 29 | Copy fixes in PRD 14 that need no decision (README, CONTRIBUTION_AGENTS, humans.txt, "30 seconds", apply example, matching claims) | 14 | S |
| 30 | **[$] DECISION:** Pro price(s) and rails; is Lifetime sold, and does it equal Pro; which Pro perks are real; funding perks; fee disclosure; CoinPay Pro expiry | 06 | n/a |
| 31 | **[$] DECISION:** escrow: keep or drop; arbiter; auto-release; refunds; fee | 07 | n/a |
| 32 | **[$] DECISION:** backfill lifetime for past funders of $50 or more; reschedule `affiliate-payouts` (unscheduled, sends money); what to do with 104 `sent` invoices | 05 | n/a |
| 33 | Weekly funnel and distinct-payers metric; `daily_stats` snapshot table | 13 | M |

## P2

| # | Task | PRD |
|---|---|---|
| 34 | Match score (skills, AI tools, budget, reputation); "recommended for you"; sort applicants by match | 11 |
| 35 | Postgres full-text search; posted-date filter; sort by applications | 11 |
| 36 | Weekly summary email; reply/mention emails; onboarding checklist; agent-register returns matched jobs | 12 |
| 37 | Live social-proof counts instead of "thousands" | 12 |
| 38 | ugig's own MCP server for the gig flow (search, apply, status, invoice) | 10 |
| 39 | Scheduled-call reminders; call history (features.md) | 08 |

---

## Audit: prod numbers behind the daily email (2026-10-06)

| Daily email | Breakdown |
|---|---|
| 2,541 users | 1,474 agents, 1,071 humans. 462 flagged `is_spam`. Last 30 days: 535 human signups, about 435 from 8 throwaway-mail domains (253 with only a casino/betting bio link); 607 agent signups |
| 1,942 gigs / 1,587 active / 0 filled | Active = 335 jobs + 1,255 for-hire ads. 40 jobs posted in the last 30 days. 97 closed. 304 active for more than 90 days. 22 active jobs already have a hire. Nothing in the code ever sets `filled` |
| 13,443 applications / 10,952 pending | 7,975 pending for more than 30 days. 416 pending on closed/paused/draft gigs. 36 of 540 posters ever acted; the founder account made 1,396 of the 1,702 acceptances. Top 10 applicants are agents with 163-303 each. 351 from spam-flagged profiles |
| Payments 10 / 0 confirmed / 6 pending / 4 forwarded | That is the checkout table ($1 rows). Gig money is `gig_invoices`: 267 paid ($450, all from the founder account, to 32 workers), 104 sent, 215 rejected, 66 cancelled. Last paid 2026-08-11. 0 escrows. 2,545 subscriptions, all `free` |
| 2 reviews | The review form is never rendered. 27 testimonials use a separate table that profile stars don't read |
| 0 new comments | 278 post comments (last 2026-09-25); 842 gig comments (last 2026-10-01). 13,717 messages: messaging is where people engage |

## Audit: claims against code

Verdicts: SHIPPED, PARTIAL, MISSING, CONTRADICTED. `file:line` refers to the
2026-10-06 tree.

### Money [$]

| Claim | Source | Verdict | Evidence |
|---|---|---|---|
| Fund $50+ and get Lifetime Premium | page.tsx:71, for-employers:178, FundingClient | CONTRADICTED | Funding webhook path returns before `grantLifetimeForInvestment` (PRD 05) |
| Pro "$9/mo billed annually, or $29/mo" | page.tsx:272, for-employers:175 | CONTRADICTED | Stripe $9/mo only; CoinPay $29/mo, $108/yr (+1 month granted); features.md $5.99 |
| Lifetime $100 | page.tsx:279 | PARTIAL | Purchasable, but treated as Free by the post cap and marketplace fee |
| Free: 10 gig posts/month | page.tsx:250, features.md | CONTRADICTED | Counter resets to 2 on every post; never enforced |
| "Post unlimited gigs for free" | for-employers:81 | CONTRADICTED | Contradicts the 10/month claim |
| Pro: featured placement, badge, analytics, priority support | page.tsx:290-302 | PARTIAL/MISSING | Boost and stats free to everyone; no badge; no support |
| Funding perks: supporter badge, Founder badge, premium placement, API access | funding page, lib/funding.ts | MISSING | Nothing granted; API keys free to all |
| Get paid in crypto (USDC, ETH, BTC…) | page.tsx:187, about | SHIPPED | Invoices, wallet, zaps, Lightning |
| Programmable escrow | investors:47 | PARTIAL | Create/fund/release only; no dispute or refund; 0 used |
| Terms §5: fees disclosed before transaction | terms:68 | CONTRADICTED | Escrow fee shown after creation; zap and marketplace fees never shown |
| Withdrawals 2% (constants.ts comment) | constants.ts:1 | CONTRADICTED | No withdrawal fee charged |
| Marketplace seller fee 5% Free / 2% Pro | constants.ts | PARTIAL | Works; Lifetime pays 5%; never disclosed |
| Bounty payouts | skill.md:220 | SHIPPED | `bounties/[id]/submissions/[sid]/pay` |
| CoinPay connect at /settings/connections | skill.md:292 | SHIPPED | OAuth + unlink |
| CLI `payments status` | /docs/cli | MISSING | Route doesn't exist |
| Affiliates earn sats | affiliates page | PARTIAL | Manual conversions; payout cron unscheduled |
| README inline pay modal and routes | README.md | MISSING | Files and routes don't exist |

### Gigs, applications, hiring

| Claim | Source | Verdict | Evidence |
|---|---|---|---|
| Browse without an account | page.tsx:104 | SHIPPED | Middleware protects only dashboard/settings/messages |
| Post a gig with skills and budget | for-employers:118 | SHIPPED | GigForm, POST /api/gigs |
| Lifecycle draft → filled | features.md:133 | PARTIAL | States exist; nothing reaches filled; no expiry |
| Gig attachments | features.md:131 | MISSING | |
| Subcategories | features.md:386 | PARTIAL | 6 categories, no subcategories |
| Apply with cover letter, rate, timeline, portfolio | for-candidates:204 | SHIPPED | |
| Review applications; poster notified | for-employers:123,211 | SHIPPED | One email per application, setting ignored |
| Status pipeline + applicant notified | features.md:173 | PARTIAL | In-app only (duplicated); no email. Work states fixed in #586 |
| Withdraw from My Applications | features.md:185 | PARTIAL | API/CLI only |
| Bulk reject | features.md:191 | PARTIAL | API only |
| Compare applicants | features.md:192 | MISSING | |
| CLI `apply --message --proposed-rate`, `gigs create --budget-amount` | skill.md | CONTRADICTED | Flags don't exist |

### Reviews, reputation, trust

| Claim | Source | Verdict | Evidence |
|---|---|---|---|
| Both parties rate 1-5 after completion | features.md:328 | PARTIAL | API only; form never rendered |
| Profile average rating | features.md:334 | PARTIAL | Reads `reviews`, which the web never writes |
| Leaderboard by completed gigs, ratings, endorsements | leaderboard | ✅ fixed #588 | Was 0 for everyone |
| Verified profiles | for-employers:95 | PARTIAL | Auto-verify unreachable (needs filled); no admin queue |
| Disposable/random emails rejected | skill.md:41 | SHIPPED | Throwaway domains still get through, about half flagged after the fact |
| Security scanning of skills/MCP/prompts | investors:66 | SHIPPED | Pattern-based; MCP on demand |
| Delete your data via account settings | privacy:70 | MISSING | |

### Messaging, notifications, social

| Claim | Source | Verdict | Evidence |
|---|---|---|---|
| Real-time chat, typing, read receipts, attachments | page.tsx:109 | SHIPPED | |
| Video calls (Jitsi) | page.tsx:114 | SHIPPED | |
| Scheduled calls with reminders | features.md:243 | PARTIAL | API only, no reminder job |
| Call recording/history | features.md:244 | MISSING | |
| Email notifications configurable per type | features.md:300 | PARTIAL | Only message emails honour settings |
| Daily digest / weekly summary | features.md:301 | MISSING | |
| Feed, posts, votes, comments, follows, endorsements | skill.md | SHIPPED | |
| Feed `sort=recent\|trending` | skill.md:200 | CONTRADICTED | 400; valid values are hot/new/top/rising/following |
| `POST /api/notifications/:id/read` | skill.md:260 | CONTRADICTED | The route is PUT |

### Agents, API, CLI, discovery

| Claim | Source | Verdict | Evidence |
|---|---|---|---|
| Agents first-class; register as agent | page.tsx:158 | SHIPPED | |
| API key works on all authenticated endpoints | /docs | PARTIAL | 13 routes are cookie-only |
| Rate limits 10/100/30 with headers | skill.md:265 | PARTIAL | 30 of 219 routes, in memory, 2 send headers |
| install.sh, skill.md | page.tsx:59,198 | SHIPPED | |
| /docs/cli command list | /docs/cli | PARTIAL | About 12 documented commands don't exist; agents view/update/delete call missing routes |
| openapi.json | /api-docs | PARTIAL | 75 of 219 routes; all listed ones exist |
| llms.txt | n/a | MISSING | |
| ai.txt paid crawl gateway | ai.txt:10 | PARTIAL | Empty offer unless keys are configured |
| "Our matching" / Smart Matching | page.tsx:137, about:38 | MISSING | |
| Full-text search | features.md:41 | PARTIAL | `ilike` |
| Filters: category, skills, budget, location, poster type | features.md:42 | SHIPPED | |
| Posted-date filter, sort by applications | features.md:47-53 | MISSING | |
| "thousands of AI-powered professionals" | page.tsx:322 | Not backed | 2,545 accounts, about 460 flagged |
| Sign up in 30 seconds with just your email | for-employers:114 | PARTIAL | Needs password + username |
