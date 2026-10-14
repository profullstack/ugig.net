-- Buy now by PayPal.
--
-- CoinPay cannot escrow PayPal: an order captures straight into ugig's own
-- PayPal account. So a PayPal order is held by ugig, not by an escrow: on
-- release (by the buyer, or automatically after 14 days) the seller's payout is
-- recorded as owed, and an admin pays it to the seller's CoinPay wallet and
-- marks it paid. Disputes and refunds are handled by an admin in PayPal.

alter table public.gig_orders
  add column if not exists payment_rail text not null default 'crypto',
  add column if not exists paypal_transaction_id text,
  add column if not exists payout_currency text,
  add column if not exists payout_status text,
  add column if not exists payout_tx_hash text,
  add column if not exists payout_paid_at timestamptz;

alter table public.gig_orders alter column buyer_refund_address drop not null;

alter table public.gig_orders drop constraint if exists gig_orders_payment_rail_check;
alter table public.gig_orders add constraint gig_orders_payment_rail_check
  check (payment_rail in ('crypto', 'paypal'));

alter table public.gig_orders drop constraint if exists gig_orders_payout_status_check;
alter table public.gig_orders add constraint gig_orders_payout_status_check
  check (payout_status is null or payout_status in ('owed', 'paid'));

-- A crypto order refunds on-chain, so it needs somewhere to refund to.
alter table public.gig_orders drop constraint if exists gig_orders_crypto_needs_refund_address;
alter table public.gig_orders add constraint gig_orders_crypto_needs_refund_address
  check (payment_rail <> 'crypto' or buyer_refund_address is not null);

create unique index if not exists idx_gig_orders_paypal_tx
  on public.gig_orders (paypal_transaction_id) where paypal_transaction_id is not null;
create index if not exists idx_gig_orders_payout_owed
  on public.gig_orders (released_at) where payout_status = 'owed';

grant select (payment_rail, payout_currency, payout_status, payout_tx_hash, payout_paid_at)
  on public.gig_orders to authenticated;
