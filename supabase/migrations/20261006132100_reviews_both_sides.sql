-- Reviews from both sides of a gig, and a prompt to leave one (PRD 04).
--
-- 1. One review per (gig, reviewer, reviewee), not per (gig, reviewer).
--    Prod still has 001_initial_schema's UNIQUE (gig_id, reviewer_id), so a
--    poster who hired two workers could only ever rate one of them. Later
--    migrations declared the three-column key but used CREATE TABLE IF NOT
--    EXISTS, so it never reached prod.
-- 2. update_profile_rating runs as SECURITY DEFINER. Reviews are inserted
--    with the reviewer's session; the trigger then updates the REVIEWEE's
--    profile, which RLS (profiles_update_own) silently refused, so
--    profiles.average_rating / total_reviews never moved.
-- 3. Backfill: gig testimonials carry a star rating that nothing counted.
--    POST /api/testimonials now copies it into `reviews` (the one table
--    profile stars, the leaderboard and auto-verification read); this copies
--    the existing ones, under the same rules as POST /api/reviews.
-- 4. review_request notifications when an invoice is paid, an escrow is
--    released, or a gig is filled: one per side, linking to
--    /gigs/<id>#review, skipped once that reviewer has reviewed that reviewee
--    for that gig, and never sent twice for the same pair. No email.
--
-- Hired = application status in ('accepted','in_progress','completed','paid'),
-- the same list as HIRED_APPLICATION_STATUSES in src/lib/application-status.ts
-- (src/lib/reviews/review-request-migration.test.ts keeps them in step).
--
-- Idempotent: IF EXISTS / IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT.

-- ── 1. Unique key ─────────────────────────────────────────────────────────
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_gig_id_reviewer_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_gig_reviewer_reviewee_key
  ON public.reviews (gig_id, reviewer_id, reviewee_id);

-- ── 2. Rating rollup can write the reviewee's profile ─────────────────────
CREATE OR REPLACE FUNCTION public.update_profile_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.profiles
    SET
        average_rating = (
            SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
            FROM public.reviews
            WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id)
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM public.reviews
            WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.reviewee_id, OLD.reviewee_id);

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── 3. Backfill gig testimonials into reviews ─────────────────────────────
-- The "new review" notification and activity-feed triggers are paused so
-- old testimonials do not notify anyone or appear as new activity today.
-- update_profile_rating stays on so profile averages pick them up.
ALTER TABLE public.reviews DISABLE TRIGGER on_new_review;
ALTER TABLE public.reviews DISABLE TRIGGER on_review_created;

INSERT INTO public.reviews (gig_id, reviewer_id, reviewee_id, rating, comment, created_at)
SELECT DISTINCT ON (t.gig_id, t.author_id, COALESCE(t.profile_id, g.poster_id))
       t.gig_id,
       t.author_id,
       COALESCE(t.profile_id, g.poster_id),
       t.rating,
       NULLIF(LEFT(BTRIM(t.content), 2000), ''),
       t.created_at
FROM public.testimonials t
JOIN public.gigs g ON g.id = t.gig_id
WHERE t.gig_id IS NOT NULL
  AND g.poster_id IS NOT NULL
  AND t.rating BETWEEN 1 AND 5
  AND COALESCE(t.profile_id, g.poster_id) <> t.author_id
  AND (
    g.poster_id = t.author_id
    OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.gig_id = t.gig_id AND a.applicant_id = t.author_id
        AND a.status::text = ANY (ARRAY['accepted','in_progress','completed','paid'])
    )
  )
  AND (
    g.poster_id = COALESCE(t.profile_id, g.poster_id)
    OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.gig_id = t.gig_id AND a.applicant_id = t.profile_id
        AND a.status::text = ANY (ARRAY['accepted','in_progress','completed','paid'])
    )
  )
  AND NOT public.users_are_blocked(t.author_id, COALESCE(t.profile_id, g.poster_id))
ORDER BY t.gig_id, t.author_id, COALESCE(t.profile_id, g.poster_id), t.created_at DESC
ON CONFLICT (gig_id, reviewer_id, reviewee_id) DO NOTHING;

ALTER TABLE public.reviews ENABLE TRIGGER on_new_review;
ALTER TABLE public.reviews ENABLE TRIGGER on_review_created;

-- ── 4. Review prompts ─────────────────────────────────────────────────────

-- Ask one person to review another for a gig, unless they already did or
-- were already asked. Returns 1 if a notification was created, else 0.
CREATE OR REPLACE FUNCTION public.request_review_from(
  p_reviewer_id uuid,
  p_reviewee_id uuid,
  p_gig_id uuid,
  p_gig_title text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_handle text;
BEGIN
  IF p_reviewer_id IS NULL OR p_reviewee_id IS NULL OR p_reviewer_id = p_reviewee_id THEN
    RETURN 0;
  END IF;

  -- Already reviewed this person for this gig.
  IF EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.gig_id = p_gig_id
      AND r.reviewer_id = p_reviewer_id
      AND r.reviewee_id = p_reviewee_id
  ) THEN
    RETURN 0;
  END IF;

  -- Already asked (a gig can be paid, released and filled; ask once).
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_reviewer_id
      AND n.type::text = 'review_request'
      AND n.data->>'gig_id' = p_gig_id::text
      AND n.data->>'reviewee_id' = p_reviewee_id::text
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE('@' || NULLIF(p.username, ''), NULLIF(p.full_name, ''), 'your collaborator')
    INTO v_handle
  FROM public.profiles p
  WHERE p.id = p_reviewee_id;

  PERFORM public.create_notification(
    p_reviewer_id,
    'review_request',
    'Rate ' || COALESCE(v_handle, 'your collaborator') || ' for ' || COALESCE(NULLIF(p_gig_title, ''), 'your gig'),
    'How did it go? Your rating shows on their profile.',
    jsonb_build_object(
      'gig_id', p_gig_id,
      'reviewee_id', p_reviewee_id,
      'reason', p_reason,
      'link', '/gigs/' || p_gig_id || '#review'
    )
  );
  RETURN 1;
END;
$function$;

-- Ask both sides of one hire (poster <-> worker) to review each other.
CREATE OR REPLACE FUNCTION public.request_gig_reviews(
  p_gig_id uuid,
  p_worker_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gig record;
  v_sent integer := 0;
BEGIN
  SELECT g.id, g.title, g.poster_id INTO v_gig
  FROM public.gigs g WHERE g.id = p_gig_id;

  IF NOT FOUND OR v_gig.poster_id IS NULL OR p_worker_id IS NULL
     OR v_gig.poster_id = p_worker_id THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.gig_id = p_gig_id
      AND a.applicant_id = p_worker_id
      AND a.status::text = ANY (ARRAY['accepted','in_progress','completed','paid'])
  ) THEN
    RETURN 0;
  END IF;

  IF public.users_are_blocked(v_gig.poster_id, p_worker_id) THEN
    RETURN 0;
  END IF;

  v_sent := v_sent + public.request_review_from(v_gig.poster_id, p_worker_id, p_gig_id, v_gig.title, p_reason);
  v_sent := v_sent + public.request_review_from(p_worker_id, v_gig.poster_id, p_gig_id, v_gig.title, p_reason);
  RETURN v_sent;
END;
$function$;

-- Only the triggers below call these; users must not be able to send
-- arbitrary notifications through PostgREST RPC.
REVOKE ALL ON FUNCTION public.request_review_from(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_gig_reviews(uuid, uuid, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.request_review_from(uuid, uuid, uuid, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.request_gig_reviews(uuid, uuid, text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.request_review_from(uuid, uuid, uuid, text, text) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.request_gig_reviews(uuid, uuid, text) FROM authenticated';
  END IF;
END $$;

-- Trigger functions. A failure here must never block the payment, release or
-- fill that fired it, so errors become warnings.

CREATE OR REPLACE FUNCTION public.review_request_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM public.request_gig_reviews(NEW.gig_id, NEW.worker_id, 'invoice_paid');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'review_request_on_invoice_paid failed for invoice %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_request_on_escrow_released()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'released' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'released') THEN
    BEGIN
      PERFORM public.request_gig_reviews(NEW.gig_id, NEW.worker_id, 'escrow_released');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'review_request_on_escrow_released failed for escrow %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_request_on_gig_filled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
BEGIN
  IF NEW.status::text = 'filled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      FOR v_app IN
        SELECT DISTINCT a.applicant_id
        FROM public.applications a
        WHERE a.gig_id = NEW.id
          AND a.status::text = ANY (ARRAY['accepted','in_progress','completed','paid'])
      LOOP
        PERFORM public.request_gig_reviews(NEW.id, v_app.applicant_id, 'gig_filled');
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'review_request_on_gig_filled failed for gig %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_invoice_paid_request_reviews ON public.gig_invoices;
CREATE TRIGGER on_invoice_paid_request_reviews
  AFTER INSERT OR UPDATE OF status ON public.gig_invoices
  FOR EACH ROW EXECUTE FUNCTION public.review_request_on_invoice_paid();

DROP TRIGGER IF EXISTS on_escrow_released_request_reviews ON public.gig_escrows;
CREATE TRIGGER on_escrow_released_request_reviews
  AFTER INSERT OR UPDATE OF status ON public.gig_escrows
  FOR EACH ROW EXECUTE FUNCTION public.review_request_on_escrow_released();

DROP TRIGGER IF EXISTS on_gig_filled_request_reviews ON public.gigs;
CREATE TRIGGER on_gig_filled_request_reviews
  AFTER UPDATE OF status ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.review_request_on_gig_filled();
