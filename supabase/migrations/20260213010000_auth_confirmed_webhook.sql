-- Trigger welcome email when user confirms their email
-- Uses Supabase's pg_net extension to call our API endpoint

-- Create a function that fires when auth.users is updated with email_confirmed_at
CREATE OR REPLACE FUNCTION public.notify_email_confirmed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  app_url TEXT;
  webhook_secret TEXT;
BEGIN
  -- Only fire when email_confirmed_at changes from NULL to a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    -- Get the app URL from vault or use default
    app_url := COALESCE(
      current_setting('app.settings.app_url', true),
      'https://ugig.net'
    );

    -- Call the webhook endpoint
    PERFORM net.http_post(
      url := app_url || '/api/auth/confirmed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.auth_webhook_secret', true),
          ''
        )
      ),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'record', jsonb_build_object(
          'id', NEW.id,
          'email', NEW.email,
          'email_confirmed_at', NEW.email_confirmed_at
        ),
        'old_record', jsonb_build_object(
          'id', OLD.id,
          'email', OLD.email,
          'email_confirmed_at', OLD.email_confirmed_at
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_email_confirmed_send_welcome ON auth.users;

-- Create the trigger
CREATE TRIGGER on_email_confirmed_send_welcome
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_confirmed();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.notify_email_confirmed() TO postgres, service_role;
