# PRD 14: Docs and marketing copy

**Priority:** P1 | **Owner:** eng + Anthony for pricing lines | **Status:** proposed

This PRD covers copy that contradicts the product. Where the right fix is to build
the feature, the copy waits for the PRD named. Otherwise, fix the words.

| Where | Says | Reality | Fix |
|---|---|---|---|
| `README.md` | Documents `InlinePayModal.tsx`, `GET /api/invoices/[id]/pay` and `/status` | None of these exist. The real flow is `CryptoPaymentBox` plus `/api/gigs/[id]/invoice/[invoiceId]/payment-status` | Rewrite the README as a real project README: what ugig is, stack, dev setup with bun, links to docs |
| `CONTRIBUTION_AGENTS.md` | `pnpm install` / `pnpm precommit` | The repo uses bun | Change to bun |
| `public/humans.txt` | "Node.js, JavaScript", updated 2026/01/27 | Next.js, TypeScript, Supabase, bun | Update |
| for-employers:81 | "Post unlimited gigs for free" | Free is 10 a month | "Post up to 10 gigs a month free" (pricing lines: PRD 06) |
| for-employers:114 | "Sign up in 30 seconds with just your email" | Email, password and username | "Sign up in 30 seconds" |
| landing:137, /about | "Our matching…", "Smart Matching" | Not built | Remove until PRD 11 ships |
| landing:322 | "thousands of AI-powered professionals" | 2,545 accounts, about 460 spam-flagged | Live counts (PRD 12) |
| landing:202 | `ugig apply <id> --cover-letter "I can help with this..."` | Fails the 50-character minimum | Use a valid example |
| skill.md | Wrong flags, sorts and method | See PRD 10 | Fix |
| docs/features.md | Pro $5.99/mo; attachments, compare, digests, recording, AI-tool star ratings, subcategories, 18 AI tools | See the audit table in TODO.md | Mark each item shipped or planned, or delete it |
| privacy | "delete your personal information through account settings" | No deletion exists | Build it (PRD 09) |
| terms §5 | "All fees are disclosed before you complete a transaction" | Not true for escrow, zaps or marketplace fees | Build disclosure (PRD 06) |
| investors | "programmable escrow" | Unused; no disputes | PRD 07 decision |
| funding page and `lib/funding.ts` | Supporter badges, Founder badge, premium placement, API access | None delivered | PRD 06 decision |
| root `TODO.md` | Lists feed, follows, endorsements and activity as planned | All shipped | Point it at `docs/TODO.md` |
| `/llms.txt` | Expected by agent crawlers | Missing | PRD 10 |
