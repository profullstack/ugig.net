-- Drop the pg_net webhook trigger that was blocking auth
-- The webhook is already configured in Supabase Dashboard instead
DROP TRIGGER IF EXISTS on_email_confirmed_send_welcome ON auth.users;
DROP FUNCTION IF EXISTS public.notify_email_confirmed();
