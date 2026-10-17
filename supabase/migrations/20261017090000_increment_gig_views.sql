-- Gig view counts never moved for anyone but the poster.
--
-- GET /api/gigs/[id] called rpc("increment_gig_views"), a function that was
-- never created, and fell back to `update gigs set views_count = ...` as the
-- caller. RLS lets only the poster update a gig, so for every other viewer the
-- update matched zero rows and failed silently; the /gigs/[id] page did the same
-- direct update. Result: the only views ever counted were the owner's own.
--
-- This counts a view as the definer, and skips the poster so a seller's own
-- visits no longer inflate the number. Bots are filtered in the app (user agent).
CREATE OR REPLACE FUNCTION public.increment_gig_views(gig_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.gigs
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = increment_gig_views.gig_id
     AND poster_id IS DISTINCT FROM auth.uid();
$$;

REVOKE ALL ON FUNCTION public.increment_gig_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_gig_views(uuid) TO anon, authenticated, service_role;

-- A view is not an edit: don't let counting one move gigs.updated_at (sitemap
-- lastmod, "recently updated"). Every other update still touches it.
CREATE OR REPLACE FUNCTION public.gigs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- ranked_at is a generated column, which is still NULL in a BEFORE
  -- trigger's NEW, so it is left out of the comparison.
  IF (to_jsonb(NEW) - ARRAY['views_count', 'updated_at', 'ranked_at'])
     = (to_jsonb(OLD) - ARRAY['views_count', 'updated_at', 'ranked_at']) THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_gigs_updated_at ON public.gigs;
CREATE TRIGGER update_gigs_updated_at
  BEFORE UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.gigs_touch_updated_at();
