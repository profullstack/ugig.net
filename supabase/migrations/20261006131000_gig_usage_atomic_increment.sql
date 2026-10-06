-- Free accounts get 10 active gig posts per month (src/lib/plans.ts).
--
-- 1. increment_gig_usage creates the month's row if it is missing, so one RPC
--    call is enough and the count can never be reset by an upsert.
-- 2. A signed-in caller may only increment their own usage (the function is
--    SECURITY DEFINER; the service role has no auth.uid() and may increment any).
-- 3. Users could previously INSERT/UPDATE their own gig_usage row through
--    PostgREST and reset the counter. Only the function (and the service role)
--    writes it now. Reads stay as they were.
--
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS.

CREATE OR REPLACE FUNCTION public.increment_gig_usage(
  p_user_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'cannot increment another user''s gig usage'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.gig_usage (user_id, month, year, posts_count)
  VALUES (p_user_id, p_month, p_year, 1)
  ON CONFLICT (user_id, month, year)
  DO UPDATE SET posts_count = public.gig_usage.posts_count + 1;
END;
$$;

DROP POLICY IF EXISTS "Users can insert own usage" ON public.gig_usage;
DROP POLICY IF EXISTS "Users can track own usage" ON public.gig_usage;
DROP POLICY IF EXISTS "Users can update own usage" ON public.gig_usage;
