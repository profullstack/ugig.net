-- The shared @profullstack/profile fields (email, first_name, last_name,
-- company_domain, job_title, linkedin_url) in the package's own table.
--
-- Why not columns on public.profiles: profiles is readable by anon through
-- PostgREST ("Public profiles are viewable by everyone"), so an email column
-- there would publish every address; and profiles.username is NOT NULL with
-- no default, which the package's upsert cannot satisfy. This table is
-- service-role only (RLS on, no policies, no anon/authenticated grants).
--
-- profiles.full_name and profiles.linkedin_url stay as they are (public
-- profile fields); the app fills an empty full_name from first/last names.
--
-- Apply by hand on dev2 (there is no automatic migration step):
--   docker exec -i ugig-net-supabase-db psql -U postgres -d postgres -1 < this file
--   then: notify pgrst, 'reload schema';
-- Additive and idempotent, so it is safe before the deploy.

create table if not exists public.user_profiles (
  "user_id" uuid primary key references auth.users (id) on delete cascade,
  "email" text,
  "first_name" text,
  "last_name" text,
  "company_domain" text,
  "job_title" text,
  "linkedin_url" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "user_profiles_email" on public.user_profiles (lower("email"));
create index if not exists "user_profiles_company_domain" on public.user_profiles ("company_domain");

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;

-- One-time backfill for human accounts, idempotent, never overwriting a value
-- already present. Email comes from auth.users. full_name is split into
-- first/last only when it reads as a person's "First Last" (capitalised words
-- of letters) and has no business or bot words; handles, brands and agents
-- are left alone. linkedin_url is copied only when it points at a profile
-- (linkedin.com/in/...), as stored.
insert into public.user_profiles as up (user_id, email, first_name, last_name, linkedin_url)
select p.id,
       lower(u.email),
       case when n.ok then split_part(n.name, ' ', 1) end,
       case when n.ok then nullif(btrim(substr(n.name, length(split_part(n.name, ' ', 1)) + 1)), '') end,
       case when p.linkedin_url ~* 'linkedin\.com/in/[^/]+' then p.linkedin_url end
  from public.profiles p
  join auth.users u on u.id = p.id
  cross join lateral (
    select btrim(p.full_name) as name,
           coalesce(
             btrim(p.full_name) ~ '^[[:upper:]][[:alpha:]''’-]*( [[:upper:]][[:alpha:]''’.-]*)+$'
             and btrim(p.full_name) !~* '\m(agent|ai|api|bot|desk|tools?|limited|ltd|inc|llc|consultancy|freelancer|scout|research|packaging|lab|labs|studio|team|services?|solutions?)\M',
             false) as ok
  ) n
 where p.account_type = 'human'
   and not p.is_spam
on conflict (user_id) do update
   set email        = coalesce(up.email, excluded.email),
       first_name   = coalesce(up.first_name, excluded.first_name),
       last_name    = coalesce(up.last_name, excluded.last_name),
       linkedin_url = coalesce(up.linkedin_url, excluded.linkedin_url);
