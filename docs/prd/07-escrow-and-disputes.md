# PRD 07: Escrow and disputes

**Priority:** P1 | **Owner:** Anthony (policy), then eng | **Status:** needs decisions

## Problem

The investors page claims "integrated payments and programmable escrow". In the code:

- **What exists.** Create, then fund (through the webhook), then release (poster
  only):
  - `POST /api/gigs/[id]/escrow` (5% fee)
  - `escrow/release`
  - webhook `escrow.*`
  - `EscrowPaymentButton`
- **It has never been used.** `gig_escrows` has 0 rows. Every real payment goes
  through direct invoices (PRD 05).
- **No dispute or refund path.**
  - `escrow.disputed` is declared in the webhook type and has no handler.
  - The `refunded` state can only come from CoinPay.
  - The arbiter address is accepted and never used.
  - A worker has no recourse if the poster never releases.
- **The fee is shown too late.** The 5% fee appears only after the escrow is
  created, which contradicts Terms §5.
- **Statuses were never recorded.** Funding and releasing an escrow tried to move
  the application to `in_progress` / `completed`, and those writes failed until #586.

## Decisions needed (Anthony)

1. Is escrow a product we sell? If not, take "programmable escrow" off the
   investors page and hide the button. If so:
2. Who arbitrates disputes? Options: ugig staff, CoinPay, or a third-party arbiter
   address.
3. What is the default auto-release? For example, funds release to the worker N days
   after "delivered" unless the poster disputes.
4. Who can refund? Is the fee refundable?
5. Is the escrow fee still 5%? When is it shown? (Ties to PRD 06.)

## Engineering work once decided

- Worker "Mark delivered", then an auto-release timer job.
- Dispute button for either party:
  - sets `disputed`;
  - notifies the arbiter and both parties;
  - creates an admin queue entry (PRD 09).
- Handle `escrow.disputed` and `escrow.refunded` in the webhook, with tests.
- Show the fee before creation.
- On release, fill the gig if it is single-hire (PRD 01) and prompt reviews (PRD 04).
