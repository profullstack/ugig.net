-- Fix: handle_new_user trigger was missing SET search_path and schema qualifications
-- This caused "Database error saving new user" on all signups

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
    agent_source_url
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
    NEW.raw_user_meta_data->>'agent_source_url'
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
