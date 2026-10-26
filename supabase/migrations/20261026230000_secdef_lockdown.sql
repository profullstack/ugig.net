-- Lock down SECURITY DEFINER functions and privileged columns (2026-10-26 audit).
--
-- Supabase grants EXECUTE to PUBLIC on every new function, so each SECURITY
-- DEFINER function in public was callable with the anon key, including
-- withdraw_balance(any user, any amount: a negative amount minted balance),
-- create_notification(any user), the gig-usage counters and get_api_key_user.
-- RLS "update own row" policies also let users write columns only the server
-- should set (profiles.is_admin and credits, subscriptions.plan, invoice and
-- escrow status, bounty payout status, listing scan status...).
--
-- After this migration a NEW function the browser calls (or an RLS policy
-- uses) needs an explicit GRANT EXECUTE ... TO anon, authenticated.

-- 1. Internal functions: server (service role), triggers or other definer
--    functions only.
revoke execute on function public.withdraw_balance(uuid, integer) from public, anon, authenticated;
revoke execute on function public.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.decrement_gig_usage(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.increment_gig_usage(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.increment_gig_usage_for_active(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_api_key_user(text) from public, anon, authenticated;
revoke execute on function public.update_api_key_last_used(uuid) from public, anon, authenticated;
revoke execute on function public.increment_affiliate_offer_total_affiliates(uuid) from public, anon, authenticated;
revoke execute on function public.moderate_affiliate_application(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.bump_autoblog_integration(uuid) from public, anon, authenticated;

grant execute on function public.withdraw_balance(uuid, integer) to service_role;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.decrement_gig_usage(uuid, integer, integer) to service_role;
grant execute on function public.increment_gig_usage(uuid, integer, integer) to service_role;
grant execute on function public.increment_gig_usage_for_active(uuid, integer, integer) to service_role;
grant execute on function public.get_api_key_user(text) to service_role;
grant execute on function public.update_api_key_last_used(uuid) to service_role;
grant execute on function public.increment_affiliate_offer_total_affiliates(uuid) to service_role;
grant execute on function public.moderate_affiliate_application(uuid, uuid, uuid, text) to service_role;
grant execute on function public.bump_autoblog_integration(uuid) to service_role;

-- Trigger and event-trigger functions are never RPCs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 2. Block lookups answer only for the caller (the server may ask for anyone).
create or replace function public.blocked_user_ids(for_user uuid)
returns table(user_id uuid)
language sql
stable security definer
set search_path to 'public'
as $function$
  select blocked_id from user_blocks
   where blocker_id = for_user
     and (for_user = auth.uid() or coalesce(auth.role(), '') not in ('anon', 'authenticated'))
  union
  select blocker_id from user_blocks
   where blocked_id = for_user
     and (for_user = auth.uid() or coalesce(auth.role(), '') not in ('anon', 'authenticated'));
$function$;

create or replace function public.users_are_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select (coalesce(auth.uid() in (user_a, user_b), false)
     or coalesce(auth.role(), '') not in ('anon', 'authenticated')
  ) and exists (
       select 1 from user_blocks
       where (blocker_id = user_a and blocked_id = user_b)
          or (blocker_id = user_b and blocked_id = user_a)
     );
$function$;

-- 3. New functions are not executable by PUBLIC/anon/authenticated by default.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- 4. Policies that had no role (or USING true) on server-only tables.
drop policy if exists "Service role can update funding payments" on public.funding_payments;
drop policy if exists "Anyone can create funding payments" on public.funding_payments;
drop policy if exists "Public can view funding payments" on public.funding_payments;
create policy "Users view own funding payments" on public.funding_payments
  for select to authenticated using (auth.uid() = user_id);
create policy "Service role manages funding payments" on public.funding_payments
  for all to service_role using (true) with check (true);

drop policy if exists "Service role manages scans" on public.skill_security_scans;
create policy "Service role manages scans" on public.skill_security_scans
  for all to service_role using (true) with check (true);

-- 5. Pin privileged columns for direct (PostgREST) writes. current_user is
--    anon/authenticated only for direct requests: SECURITY DEFINER functions
--    and their triggers run as the owner, the server as service_role.

-- 5a. profiles (is_spam/verified are pinned by protect_profile_moderation_columns).
create or replace function public.protect_profile_privileged_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.is_admin := old.is_admin;
    new.credits := old.credits;
    new.email_confirmed_at := old.email_confirmed_at;
    new.average_rating := old.average_rating;
    new.total_reviews := old.total_reviews;
    new.followers_count := old.followers_count;
    new.following_count := old.following_count;
    new.referral_code := old.referral_code;
    new.agentpass_id := old.agentpass_id;
    new.reminder_sent_at := old.reminder_sent_at;
    new.created_at := old.created_at;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_b_protect_profile_privileged on public.profiles;
create trigger trg_b_protect_profile_privileged before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- 5b. subscriptions: a user may only toggle cancel_at_period_end.
create or replace function public.protect_subscription_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_cancel boolean;
begin
  if current_user in ('anon', 'authenticated') then
    v_cancel := new.cancel_at_period_end;
    new := old;
    new.cancel_at_period_end := v_cancel;
    new.updated_at := now();
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_subscription on public.subscriptions;
create trigger trg_protect_subscription before update on public.subscriptions
  for each row execute function public.protect_subscription_columns();

-- 5c. gig_invoices: parties may cancel or reject; money fields and "paid" come
--     from the CoinPay webhook only.
create or replace function public.protect_gig_invoice_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.gig_id := old.gig_id;
    new.application_id := old.application_id;
    new.worker_id := old.worker_id;
    new.poster_id := old.poster_id;
    new.coinpay_invoice_id := old.coinpay_invoice_id;
    new.amount_usd := old.amount_usd;
    new.currency := old.currency;
    new.pay_url := old.pay_url;
    new.created_at := old.created_at;
    if new.status is distinct from old.status and new.status not in ('cancelled', 'rejected') then
      new.status := old.status;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_gig_invoice on public.gig_invoices;
create trigger trg_protect_gig_invoice before update on public.gig_invoices
  for each row execute function public.protect_gig_invoice_columns();

-- 5d. gig_escrows: the poster may mark a funded escrow released (after the
--     CoinPay release call); funding and amounts come from the webhook only.
create or replace function public.protect_gig_escrow_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.gig_id := old.gig_id;
    new.poster_id := old.poster_id;
    new.worker_id := old.worker_id;
    new.application_id := old.application_id;
    new.coinpay_escrow_id := old.coinpay_escrow_id;
    new.coinpay_payment_id := old.coinpay_payment_id;
    new.amount_usd := old.amount_usd;
    new.currency := old.currency;
    new.platform_fee_usd := old.platform_fee_usd;
    new.platform_fee_rate := old.platform_fee_rate;
    new.funded_at := old.funded_at;
    new.created_at := old.created_at;
    if new.status is distinct from old.status
       and not (old.status = 'funded' and new.status = 'released') then
      new.status := old.status;
      new.released_at := old.released_at;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_gig_escrow on public.gig_escrows;
create trigger trg_protect_gig_escrow before update on public.gig_escrows
  for each row execute function public.protect_gig_escrow_columns();

-- 5e. bounty_submissions: the submitter edits answers only; the bounty creator
--     reviews and invoices; "paid" comes from the CoinPay webhook only.
create or replace function public.protect_bounty_submission_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.bounty_id := old.bounty_id;
    new.submitter_id := old.submitter_id;
    new.paid_at := old.paid_at;
    new.created_at := old.created_at;
    if new.payout_status is distinct from old.payout_status and new.payout_status = 'paid' then
      new.payout_status := old.payout_status;
    end if;
    if not exists (select 1 from public.bounties b where b.id = old.bounty_id and b.creator_id = auth.uid()) then
      new.status := old.status;
      new.review_notes := old.review_notes;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
      new.payout_status := old.payout_status;
      new.coinpay_invoice_id := old.coinpay_invoice_id;
      new.pay_url := old.pay_url;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_bounty_submission on public.bounty_submissions;
create trigger trg_protect_bounty_submission before update on public.bounty_submissions
  for each row execute function public.protect_bounty_submission_columns();

-- 5f. applications: an applicant may withdraw, or re-open a withdrawn/archived
--     application; only the gig poster moves it anywhere else.
create or replace function public.protect_application_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.gig_id := old.gig_id;
    new.applicant_id := old.applicant_id;
    new.created_at := old.created_at;
    if new.status is distinct from old.status
       and not exists (select 1 from public.gigs g where g.id = old.gig_id and g.poster_id = auth.uid())
       and not (new.status = 'withdrawn'
                or (new.status = 'pending' and old.status in ('withdrawn', 'archived'))) then
      new.status := old.status;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_application on public.applications;
create trigger trg_protect_application before update on public.applications
  for each row execute function public.protect_application_columns();

-- 5g. testimonials: the profile owner approves or hides; the author's words and
--     rating are edited through the API (service role) only.
create or replace function public.protect_testimonial_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_status text;
begin
  if current_user in ('anon', 'authenticated') then
    v_status := new.status;
    new := old;
    new.status := v_status;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_testimonial on public.testimonials;
create trigger trg_protect_testimonial before update on public.testimonials
  for each row execute function public.protect_testimonial_columns();

-- 5h. messages: other participants may only mark read.
create or replace function public.protect_message_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_read uuid[];
begin
  if current_user in ('anon', 'authenticated') then
    v_read := new.read_by;
    new := old;
    new.read_by := v_read;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_message on public.messages;
create trigger trg_protect_message before update on public.messages
  for each row execute function public.protect_message_columns();

-- 5i. marketplace listings: counters, ratings and security-scan results are
--     written by the server and triggers only.
create or replace function public.protect_listing_stat_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.seller_id := old.seller_id;
    new.downloads_count := old.downloads_count;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.upvotes := old.upvotes;
    new.downvotes := old.downvotes;
    new.score := old.score;
    new.scan_status := old.scan_status;
    new.created_at := old.created_at;
    if tg_table_name = 'skill_listings' then
      new.comments_count := old.comments_count;
      new.zaps_total := old.zaps_total;
      new.scan_source := old.scan_source;
      new.content_hash := old.content_hash;
    else
      new.scan_rating := old.scan_rating;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_listing_stats on public.skill_listings;
create trigger trg_protect_listing_stats before update on public.skill_listings
  for each row execute function public.protect_listing_stat_columns();
drop trigger if exists trg_protect_listing_stats on public.mcp_listings;
create trigger trg_protect_listing_stats before update on public.mcp_listings
  for each row execute function public.protect_listing_stat_columns();
drop trigger if exists trg_protect_listing_stats on public.prompt_listings;
create trigger trg_protect_listing_stats before update on public.prompt_listings
  for each row execute function public.protect_listing_stat_columns();

-- 5j. gigs: views are counted by increment_gig_views; a boost is stamped now
--     (the boost route checks eligibility), never future-dated.
create or replace function public.protect_gig_columns()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user in ('anon', 'authenticated') then
    new.id := old.id;
    new.poster_id := old.poster_id;
    new.views_count := old.views_count;
    new.created_at := old.created_at;
    if new.boosted_at is distinct from old.boosted_at then
      new.boosted_at := case when new.boosted_at is null then null else now() end;
    end if;
  end if;
  return new;
end; $function$;
drop trigger if exists trg_protect_gig on public.gigs;
create trigger trg_protect_gig before update on public.gigs
  for each row execute function public.protect_gig_columns();

-- The new trigger functions are never RPCs either.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
