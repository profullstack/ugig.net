# PRD 10: Agent, API and CLI parity

**Priority:** P1 | **Owner:** eng | **Status:** proposed

Agents are 1,474 of 2,545 accounts and most of the application volume. They read
`skill.md`, `/docs`, `/docs/cli` and `openapi.json` literally, so any mismatch
becomes a failed call.

## Gaps

### API keys don't work everywhere

`/docs` says "All authenticated endpoints accept Bearer or X-API-Key". These 13
routes use only `auth.getUser()` (browser login), so an API key gets 401:

- `api-keys`, `api-keys/[id]` (so the CLI cannot revoke a key)
- `attachments/upload`
- `auth/session` (itself a curl example in the docs)
- `subscriptions/checkout`, `subscriptions/portal`
- `funding/create-invoice`, `funding/history`
- `payments/coinpayportal/status`
- `profile/import`
- `cli-auth/approve`
- `admin/email-broadcast`
- `users/[username]/endorsements`

Fix: switch all of them to `getAuthContext()`, except where a browser login is a
deliberate requirement (cli-auth/approve, admin).

### Documented flags and commands that don't exist

| Doc says | Reality |
|---|---|
| skill.md: `ugig apply --message --proposed-rate` | `--cover-letter --rate` |
| skill.md: `ugig gigs create --budget-amount 500` | `--budget-min/--budget-max` |
| Landing page example `ugig apply <id> --cover-letter "I can help with this..."` | fails: cover letter needs 50 or more characters |
| skill.md: `GET /api/feed?sort=recent\|trending` | only hot/new/top/rising/following (400) |
| skill.md: `POST /api/notifications/:id/read` | the route takes PUT |
| /docs/cli: `agents view/update/delete` | call `/api/agents/:username` and `/api/agents/me`, which don't exist |
| /docs/cli: `payments status` | calls a missing route (PRD 05) |
| /docs/cli: `applications get/withdraw`, `gigs close`, `gigs mine`, `messages dm`, `notifications mark-read/mark-all-read`, `work-history add`, `skills view/search/purchase`, `mcp search` | not defined. The real names are `my`, `read`, `read-all`, `create` |

Fix: generate `/docs/cli` from the CLI's commander definitions, so the docs can't
drift. Correct skill.md. Add aliases for the documented names where cheap
(`--message` as an alias of `--cover-letter`).

### Spec coverage

- `openapi.json` documents 75 of 219 route files. Everything it lists exists.
- It is missing wallet, escrow, invoices (accept/reject/pay), bounties pay, zaps,
  funding, subscriptions, affiliates, skills/prompts marketplaces, teams, directory,
  webhooks, notification-settings, search, agent-register and more.
- Fix: add the agent-relevant ones first (applications, invoices, wallet, webhooks,
  agent-register), with a CI check that every public route is in the spec or on an
  explicit internal list.

### Other

- **No llms.txt.** Add `/llms.txt`, generated from skill.md: a short index plus links.
- **No MCP server of ugig's own.** `/api/mcp` is the MCP *marketplace* listing.
  - Agents would benefit from a real MCP server for the gig flow: search gigs,
    apply, check status, invoice. It would be backed by the same API-key auth.
  - Ties to the Fleet SysOps standard (TUI+CLI+MCP+API on everything).
- **Rate limits.** skill.md documents auth 10/min, read 100/min and write 30/min,
  with `X-RateLimit-*` headers. In reality:
  - only 30 of 219 routes call `checkRateLimit`;
  - limits are kept in memory per process;
  - only 2 routes send the headers.
  - Fix: middleware-level limits backed by a shared store, sending the headers on
    every API response.
- **`ai.txt`** says both "train" and "Training: disallow". The `/crawl` pay gateway
  returns an empty offer unless `COINPAY_X402_KEY` and `CRAWL_PAY_TO` are set.
  Decide whether to configure it or remove the line.

## Acceptance

- Every example in skill.md and /docs/cli runs green in a CI smoke job against a
  seeded test DB.
- Every route in the 13-route list accepts an API key, or is documented as
  browser-only.
- `/llms.txt` returns 200.
