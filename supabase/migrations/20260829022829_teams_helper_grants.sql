-- The team helpers are SECURITY DEFINER so the policies can consult
-- team_members without recursing. Postgres grants EXECUTE to PUBLIC by
-- default, which also publishes them as anonymous REST RPCs — an unauthed
-- caller could probe team membership a boolean at a time. Only signed-in
-- callers need them.

revoke execute on function public.is_team_member(uuid, uuid) from public;
revoke execute on function public.is_team_member(uuid, uuid) from anon;
grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;

revoke execute on function public.is_team_manager(uuid, uuid) from public;
revoke execute on function public.is_team_manager(uuid, uuid) from anon;
grant execute on function public.is_team_manager(uuid, uuid) to authenticated, service_role;

revoke execute on function public.team_id_for_project(uuid) from public;
revoke execute on function public.team_id_for_project(uuid) from anon;
grant execute on function public.team_id_for_project(uuid) to authenticated, service_role;

-- Trigger functions are permission-checked when the trigger is created, not
-- when it fires, so this one needs no grants at all.
revoke execute on function public.add_team_owner_member() from public;
revoke execute on function public.add_team_owner_member() from anon;
revoke execute on function public.add_team_owner_member() from authenticated;

-- Signed-out visitors own no teams, so the read policies never have to run
-- for them — which is what makes the revokes above safe.
drop policy if exists "Members can read their teams" on public.teams;
create policy "Members can read their teams"
  on public.teams for select
  to authenticated
  using (public.is_team_member(id, auth.uid()));

drop policy if exists "Members can read the roster" on public.team_members;
create policy "Members can read the roster"
  on public.team_members for select
  to authenticated
  using (public.is_team_member(team_id, auth.uid()));

drop policy if exists "Members can read projects" on public.team_projects;
create policy "Members can read projects"
  on public.team_projects for select
  to authenticated
  using (public.is_team_member(team_id, auth.uid()));

drop policy if exists "Members can read assignments" on public.team_project_members;
create policy "Members can read assignments"
  on public.team_project_members for select
  to authenticated
  using (public.is_team_member(public.team_id_for_project(project_id), auth.uid()));
