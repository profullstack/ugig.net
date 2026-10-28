-- Customer webhooks move onto @profullstack/webhooks 0.2.0.
--
-- The hub keeps endpoints and a durable delivery outbox (retries with backoff,
-- delivery log, auto-disable after 20 failures in a row). Its tables are the
-- package's own schemaSql('pg', 'hub_') so a later switch to postgresStore
-- needs no data change. They are prefixed hub_ because ugig already has a
-- webhook_deliveries table (the old log, kept read-only for history).
--
-- Only the server (service role) touches these tables: RLS on, no policies,
-- and the claim RPC is granted to service_role alone.
--
-- Idempotent: safe to re-run.

create table if not exists public.hub_webhook_endpoints (
  id text primary key,
  owner text not null,
  url text not null,
  secret text not null,
  events text not null default '["*"]',
  description text not null default '',
  enabled integer not null default 1,
  failures integer not null default 0,
  disabled_reason text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_endpoints_owner on public.hub_webhook_endpoints(owner);

create table if not exists public.hub_webhook_deliveries (
  id text primary key,
  endpoint_id text not null,
  owner text not null,
  event_id text not null,
  event_type text not null,
  payload text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_at bigint not null,
  last_status integer,
  last_error text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_deliveries_due on public.hub_webhook_deliveries(status, next_at);
create index if not exists hub_webhook_deliveries_endpoint on public.hub_webhook_deliveries(endpoint_id, created_at);
create index if not exists hub_webhook_deliveries_owner on public.hub_webhook_deliveries(owner, created_at);

alter table public.hub_webhook_endpoints enable row level security;
alter table public.hub_webhook_deliveries enable row level security;
revoke all on public.hub_webhook_endpoints from anon, authenticated;
revoke all on public.hub_webhook_deliveries from anon, authenticated;
grant all on public.hub_webhook_endpoints to service_role;
grant all on public.hub_webhook_deliveries to service_role;

-- Take up to p_limit due deliveries and lease them until p_lease_until, so two
-- app processes never send the same row (the package's postgresStore claim,
-- as an RPC because PostgREST cannot express FOR UPDATE SKIP LOCKED).
create or replace function public.claim_hub_webhook_deliveries(p_now bigint, p_limit integer, p_lease_until bigint)
returns setof public.hub_webhook_deliveries
language sql
volatile
set search_path to 'public'
as $function$
  update public.hub_webhook_deliveries
     set next_at = p_lease_until
   where id in (
     select id from public.hub_webhook_deliveries
      where status = 'pending' and next_at <= p_now
      order by next_at
      limit p_limit
      for update skip locked
   )
  returning *;
$function$;
revoke execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) to service_role;

-- Carry every existing endpoint over with its id and its secret unchanged.
-- Old secrets are 64-char hex strings that ugig used whole as the HMAC key;
-- the package treats a non-whsec_ secret as its UTF-8 bytes, which is the same
-- key, so both the old X-Webhook-Signature and the new webhook-signature
-- verify with the secret the customer already has.
insert into public.hub_webhook_endpoints
  (id, owner, url, secret, events, description, enabled, failures, disabled_reason, created_at, updated_at)
select
  w.id::text,
  w.user_id::text,
  w.url,
  w.secret,
  case when cardinality(w.events) > 0 then to_jsonb(w.events)::text else '["*"]' end,
  '',
  case when w.active and cardinality(w.events) > 0 then 1 else 0 end,
  0,
  null,
  (extract(epoch from w.created_at) * 1000)::bigint,
  (extract(epoch from w.updated_at) * 1000)::bigint
from public.webhooks w
on conflict (id) do nothing;
