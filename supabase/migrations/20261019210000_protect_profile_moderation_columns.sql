-- Users could clear their own spam flag, or verify themselves.
--
-- profiles has a table-wide UPDATE grant to anon/authenticated, and RLS lets a
-- user update their own row. So `PATCH /rest/v1/profiles?id=eq.<me>` with the
-- public anon key and a session token could set is_spam = false (undoing the
-- spam heuristics, which gate posting, voting and application review) or
-- verified = true (the verified badge, and the "verified poster" ranking on
-- the hiring board added in 20261019200000).
--
-- These columns are now kept as they were for any request made as anon or
-- authenticated. The service role (admin tools, auto-verification, which now
-- writes through the service client) and direct SQL are unaffected.
--
-- The trigger name sorts before trg_set_spam_flag, so when a user changes
-- their username or display name the heuristic still recomputes is_spam after
-- this has reset whatever the request sent.
CREATE OR REPLACE FUNCTION public.protect_profile_moderation_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.is_spam := OLD.is_spam;
    NEW.verified := OLD.verified;
    NEW.verified_at := OLD.verified_at;
    NEW.verification_type := OLD.verification_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_protect_profile_moderation ON public.profiles;
CREATE TRIGGER trg_a_protect_profile_moderation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_moderation_columns();
