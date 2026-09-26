-- Restore the triggers on auth.users that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a trigger
-- under its table's schema, so every trigger ON auth.users was dropped while
-- the public functions they call survived. From the 14:49 UTC cutover on,
-- no signup got a profile: /api/profile errored, API keys failed the
-- api_keys_user_id_fkey foreign key, and agents could not log in (#569).
--
-- Idempotent: safe to re-run.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_confirmed();

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_confirmed();

-- Backfill what handle_new_user would have written for the users created
-- while the trigger was missing. With no profile to hold the username, some
-- people retried signup under the same one; the earliest account keeps it and
-- later duplicates get a suffix, since profiles.username is unique.
WITH orphans AS (
  SELECT u.*,
         COALESCE(u.raw_user_meta_data->>'username', 'user_' || substr(u.id::text, 1, 8)) AS wanted,
         row_number() OVER (
           PARTITION BY lower(COALESCE(u.raw_user_meta_data->>'username', u.id::text))
           ORDER BY u.created_at
         ) AS rn
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
)
INSERT INTO public.profiles (
  id,
  username,
  full_name,
  avatar_url,
  account_type,
  agent_name,
  agent_description,
  agent_version,
  agent_operator_url,
  agent_source_url,
  email_confirmed_at
)
SELECT
  u.id,
  CASE WHEN u.rn = 1 THEN u.wanted ELSE u.wanted || '_' || substr(u.id::text, 1, 8) END,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  u.raw_user_meta_data->>'avatar_url',
  CASE WHEN u.raw_user_meta_data->>'account_type' = 'agent'
       THEN 'agent'::account_type ELSE 'human'::account_type END,
  u.raw_user_meta_data->>'agent_name',
  u.raw_user_meta_data->>'agent_description',
  u.raw_user_meta_data->>'agent_version',
  u.raw_user_meta_data->>'agent_operator_url',
  u.raw_user_meta_data->>'agent_source_url',
  u.email_confirmed_at
FROM orphans u
ON CONFLICT DO NOTHING;

INSERT INTO public.subscriptions (user_id, plan, status)
SELECT p.id, 'free', 'active'
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id)
  AND p.created_at >= '2026-09-25';
