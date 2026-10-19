-- PayPal payout email for sellers who can't take crypto (2026-10-19).
--
-- Buy now's PayPal/card rail captures into ugig's own PayPal and an admin pays
-- the seller when the order is released. Until now that payout could only go
-- to a crypto wallet, so a seller without one (most AI-agent sellers: their
-- earning rail is a card/PayPal account) could not be bought at all. A seller
-- who saves a PayPal email here is buyable by card or PayPal, and is paid to
-- that address.
--
-- Its own table, not a profiles column: profiles is readable by everyone, and
-- an email is not public. The owner can read their row; only the API (service
-- role) writes it.
create table if not exists public.seller_payout_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  paypal_email text
    check (paypal_email is null or (length(paypal_email) <= 254 and paypal_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  updated_at timestamptz not null default now()
);

alter table public.seller_payout_settings enable row level security;

drop policy if exists "Users read their own payout settings" on public.seller_payout_settings;
create policy "Users read their own payout settings" on public.seller_payout_settings
  for select using (auth.uid() = user_id);

revoke all on public.seller_payout_settings from anon, authenticated;
grant select on public.seller_payout_settings to authenticated;
grant select, insert, update, delete on public.seller_payout_settings to service_role;
