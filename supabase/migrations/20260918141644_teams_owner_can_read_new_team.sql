-- Creating a team from a signed-in browser session failed with
--   new row violates row-level security policy for table "teams"
-- while the same insert through an API key (service role, no RLS) worked.
--
-- The INSERT policy was never the problem: owner_id = auth.uid() holds for
-- every team a user creates. The insert asks for the new row back
-- (RETURNING), and Postgres also runs the SELECT policy against a returned
-- row. That policy is is_team_member(id, auth.uid()), a STABLE function whose
-- snapshot is taken at the start of the statement, so it cannot see the team
-- row being inserted, and the owner's team_members row does not exist yet
-- either (the AFTER trigger has not fired). The helper answers false, and
-- Postgres reports it with the same message as a failed WITH CHECK.
--
-- An owner can be recognised from the row itself, no lookup needed, so say so
-- directly and keep the helper for everyone else on the roster.

drop policy if exists "Members can read their teams" on public.teams;
create policy "Members can read their teams"
  on public.teams for select
  to authenticated
  using (owner_id = auth.uid() or public.is_team_member(id, auth.uid()));
