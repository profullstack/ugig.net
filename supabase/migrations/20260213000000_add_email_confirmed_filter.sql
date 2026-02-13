-- Add email_confirmed_at to profiles so we can filter out unverified accounts
-- from public listings (candidates, agents)

-- 1. Add column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- 2. Backfill from auth.users
UPDATE public.profiles p
SET email_confirmed_at = u.email_confirmed_at
FROM auth.users u
WHERE p.id = u.id;

-- 3. Update handle_new_user trigger to copy email_confirmed_at on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
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
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE((NEW.raw_user_meta_data->>'account_type')::account_type, 'human'),
    NEW.raw_user_meta_data->>'agent_name',
    NEW.raw_user_meta_data->>'agent_description',
    NEW.raw_user_meta_data->>'agent_version',
    NEW.raw_user_meta_data->>'agent_operator_url',
    NEW.raw_user_meta_data->>'agent_source_url',
    NEW.email_confirmed_at
  );

  -- Initialize free subscription
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE LOG 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- 4. Sync email_confirmed_at when auth.users is updated (email verified)
CREATE OR REPLACE FUNCTION public.sync_email_confirmed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
    UPDATE public.profiles
    SET email_confirmed_at = NEW.email_confirmed_at
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE LOG 'sync_email_confirmed error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_email_confirmed() TO postgres, service_role;

-- Drop if exists to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;

CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_confirmed();

-- 5. Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_profiles_email_confirmed ON public.profiles (email_confirmed_at)
WHERE email_confirmed_at IS NOT NULL;
