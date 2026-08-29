-- Teams: an org with members and projects, billed at an hourly rate.
--
-- Rate resolution is most-specific-wins:
--   project assignment -> member -> project -> team
-- Every level below the team is nullable, and null means "inherit".

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null constraint teams_name_length
    check (char_length(name) between 2 and 100),
  slug text not null unique constraint teams_slug_format
    check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and char_length(slug) between 2 and 60),
  description text constraint teams_description_length
    check (description is null or char_length(description) <= 500),
  -- Default hourly rate for everyone on the team, in USD.
  billable_rate_usd numeric(12, 2) not null default 0 constraint teams_rate_range
    check (billable_rate_usd >= 0 and billable_rate_usd <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teams_owner_id on public.teams (owner_id);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  -- Null until an invited email is claimed by a real account.
  user_id uuid references public.profiles(id) on delete cascade,
  invited_email text constraint team_members_email_length
    check (invited_email is null or char_length(invited_email) <= 320),
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  title text constraint team_members_title_length
    check (title is null or char_length(title) <= 100),
  -- Null inherits the team rate.
  billable_rate_usd numeric(12, 2) constraint team_members_rate_range
    check (billable_rate_usd is null or (billable_rate_usd >= 0 and billable_rate_usd <= 100000)),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_members_identity check (user_id is not null or invited_email is not null)
);

create index if not exists idx_team_members_team_id on public.team_members (team_id);
create index if not exists idx_team_members_user_id on public.team_members (user_id);

-- One row per person per team, whether they joined by account or by invite.
create unique index if not exists team_members_team_user_key
  on public.team_members (team_id, user_id) where user_id is not null;
create unique index if not exists team_members_team_email_key
  on public.team_members (team_id, lower(invited_email))
  where invited_email is not null and user_id is null;

create table if not exists public.team_projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null constraint team_projects_name_length
    check (char_length(name) between 2 and 120),
  description text constraint team_projects_description_length
    check (description is null or char_length(description) <= 1000),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  -- Null inherits the team rate.
  billable_rate_usd numeric(12, 2) constraint team_projects_rate_range
    check (billable_rate_usd is null or (billable_rate_usd >= 0 and billable_rate_usd <= 100000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_projects_team_id on public.team_projects (team_id);
create unique index if not exists team_projects_team_name_key
  on public.team_projects (team_id, lower(name));

-- Who works on what, and at what rate when the project pays differently.
create table if not exists public.team_project_members (
  project_id uuid not null references public.team_projects(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  billable_rate_usd numeric(12, 2) constraint team_project_members_rate_range
    check (billable_rate_usd is null or (billable_rate_usd >= 0 and billable_rate_usd <= 100000)),
  created_at timestamptz not null default now(),
  primary key (project_id, member_id)
);

create index if not exists idx_team_project_members_member_id
  on public.team_project_members (member_id);

-- =============================================
-- HELPERS
--
-- Security definer so the team_members policies can consult team_members
-- without RLS recursing into itself.
-- =============================================

create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and (
    exists (select 1 from public.teams t where t.id = p_team_id and t.owner_id = p_user_id)
    or exists (
      select 1 from public.team_members m
      where m.team_id = p_team_id and m.user_id = p_user_id and m.status = 'active'
    )
  );
$$;

create or replace function public.is_team_manager(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and (
    exists (select 1 from public.teams t where t.id = p_team_id and t.owner_id = p_user_id)
    or exists (
      select 1 from public.team_members m
      where m.team_id = p_team_id and m.user_id = p_user_id
        and m.status = 'active' and m.role in ('owner', 'admin')
    )
  );
$$;

create or replace function public.team_id_for_project(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.team_projects where id = p_project_id;
$$;

-- The owner is always a member, so the roster and their rate live in one place.
create or replace function public.add_team_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (team_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists teams_add_owner_member on public.teams;
create trigger teams_add_owner_member
  after insert on public.teams
  for each row execute function public.add_team_owner_member();

drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams
  for each row execute function update_updated_at();

drop trigger if exists team_members_updated_at on public.team_members;
create trigger team_members_updated_at before update on public.team_members
  for each row execute function update_updated_at();

drop trigger if exists team_projects_updated_at on public.team_projects;
create trigger team_projects_updated_at before update on public.team_projects
  for each row execute function update_updated_at();

-- =============================================
-- RLS
-- =============================================

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_projects enable row level security;
alter table public.team_project_members enable row level security;

drop policy if exists "Members can read their teams" on public.teams;
create policy "Members can read their teams"
  on public.teams for select
  using (public.is_team_member(id, auth.uid()));

drop policy if exists "Users can create teams they own" on public.teams;
create policy "Users can create teams they own"
  on public.teams for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Managers can update their team" on public.teams;
create policy "Managers can update their team"
  on public.teams for update
  to authenticated
  using (public.is_team_manager(id, auth.uid()))
  with check (public.is_team_manager(id, auth.uid()));

drop policy if exists "Owners can delete their team" on public.teams;
create policy "Owners can delete their team"
  on public.teams for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Members can read the roster" on public.team_members;
create policy "Members can read the roster"
  on public.team_members for select
  using (public.is_team_member(team_id, auth.uid()));

drop policy if exists "Managers can add members" on public.team_members;
create policy "Managers can add members"
  on public.team_members for insert
  to authenticated
  with check (public.is_team_manager(team_id, auth.uid()));

drop policy if exists "Managers can update members" on public.team_members;
create policy "Managers can update members"
  on public.team_members for update
  to authenticated
  using (public.is_team_manager(team_id, auth.uid()))
  with check (public.is_team_manager(team_id, auth.uid()));

drop policy if exists "Managers can remove members" on public.team_members;
create policy "Managers can remove members"
  on public.team_members for delete
  to authenticated
  using (public.is_team_manager(team_id, auth.uid()));

drop policy if exists "Members can read projects" on public.team_projects;
create policy "Members can read projects"
  on public.team_projects for select
  using (public.is_team_member(team_id, auth.uid()));

drop policy if exists "Managers can create projects" on public.team_projects;
create policy "Managers can create projects"
  on public.team_projects for insert
  to authenticated
  with check (public.is_team_manager(team_id, auth.uid()));

drop policy if exists "Managers can update projects" on public.team_projects;
create policy "Managers can update projects"
  on public.team_projects for update
  to authenticated
  using (public.is_team_manager(team_id, auth.uid()))
  with check (public.is_team_manager(team_id, auth.uid()));

drop policy if exists "Managers can delete projects" on public.team_projects;
create policy "Managers can delete projects"
  on public.team_projects for delete
  to authenticated
  using (public.is_team_manager(team_id, auth.uid()));

drop policy if exists "Members can read assignments" on public.team_project_members;
create policy "Members can read assignments"
  on public.team_project_members for select
  using (public.is_team_member(public.team_id_for_project(project_id), auth.uid()));

drop policy if exists "Managers can assign members" on public.team_project_members;
create policy "Managers can assign members"
  on public.team_project_members for insert
  to authenticated
  with check (public.is_team_manager(public.team_id_for_project(project_id), auth.uid()));

drop policy if exists "Managers can update assignments" on public.team_project_members;
create policy "Managers can update assignments"
  on public.team_project_members for update
  to authenticated
  using (public.is_team_manager(public.team_id_for_project(project_id), auth.uid()))
  with check (public.is_team_manager(public.team_id_for_project(project_id), auth.uid()));

drop policy if exists "Managers can unassign members" on public.team_project_members;
create policy "Managers can unassign members"
  on public.team_project_members for delete
  to authenticated
  using (public.is_team_manager(public.team_id_for_project(project_id), auth.uid()));
