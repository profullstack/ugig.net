-- "Buy now" on fixed-price for-hire listings.
--
-- The buyer pays the listing's price into a CoinPay escrow. The seller (the
-- listing's poster) is the beneficiary; ugig takes its 5% as a CoinPay
-- marketplace fee paid to ugig's own business wallet at settlement. The buyer
-- releases once the work is delivered; untouched escrows auto-release to the
-- seller at expiry, and a dispute stops that.
--
-- Rows are written only by the API (service role). Buyers and sellers can read
-- their own orders, but never the CoinPay release token, which is what moves
-- the money: it is excluded from the column grant below.

create table if not exists public.gig_orders (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'funded', 'delivered', 'released', 'refunded', 'disputed', 'expired')),
  amount_usd numeric not null check (amount_usd > 0),
  currency text not null,
  platform_fee_rate numeric not null default 0.05,
  platform_fee_usd numeric not null default 0,
  requirements text,
  delivery_note text,
  coinpay_escrow_id text unique,
  escrow_address text,
  amount_crypto numeric,
  buyer_refund_address text not null,
  seller_payout_address text not null,
  coinpay_release_token text,
  expires_at timestamptz,
  funded_at timestamptz,
  delivered_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gig_orders_buyer_is_not_seller check (buyer_id <> seller_id)
);

create index if not exists idx_gig_orders_buyer on public.gig_orders (buyer_id, created_at desc);
create index if not exists idx_gig_orders_seller on public.gig_orders (seller_id, created_at desc);
create index if not exists idx_gig_orders_gig on public.gig_orders (gig_id);

alter table public.gig_orders enable row level security;

drop policy if exists "Buyers and sellers can view their orders" on public.gig_orders;
create policy "Buyers and sellers can view their orders" on public.gig_orders
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- Column-level read: everything except the release token.
revoke all on public.gig_orders from anon, authenticated;
grant select (
  id, gig_id, buyer_id, seller_id, status, amount_usd, currency,
  platform_fee_rate, platform_fee_usd, requirements, delivery_note,
  coinpay_escrow_id, escrow_address, amount_crypto, buyer_refund_address,
  seller_payout_address, expires_at, funded_at, delivered_at, released_at,
  metadata, created_at, updated_at
) on public.gig_orders to authenticated;

create or replace function public.gig_orders_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_gig_orders_updated_at on public.gig_orders;
create trigger trg_gig_orders_updated_at
  before update on public.gig_orders
  for each row execute function public.gig_orders_touch_updated_at();
