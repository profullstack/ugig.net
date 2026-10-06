-- Gig expiry (PRD 01 req 3, PRD 03 req 3) and held spam applications (PRD 02 req 5).
--
-- 1. gigs.expires_at: hiring gigs expire 30 days after they become active,
--    for_hire ads 60. POST /api/cron/expire-gigs pauses active gigs past it and
--    emails the poster once; POST /api/gigs/[id]/renew puts it back. A gig is
--    "paused by expiry" when status = 'paused' AND expires_at <= now().
-- 2. Backfill active gigs so nothing expires the day this ships: at least
--    14 days from now, otherwise their normal window from the last boost or
--    creation.
-- 3. A BEFORE trigger fills expires_at for any path that activates a gig
--    without setting it (and refreshes a stale one on re-activation), so the
--    app routes are not the only place the rule lives.
-- 4. Applications from spam-flagged profiles are accepted but held
--    (metadata.held = 'spam_review'): no poster notification and no bump of
--    gigs.applications_count.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS, and
-- the backfill only touches rows whose expires_at is still null.

-- ── 1. Column + index ─────────────────────────────────────────────────

ALTER TABLE public.gigs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.gigs.expires_at IS
  'When an active gig stops being listed. Set on activation: 30 days for hiring, 60 for for_hire (src/lib/limits.ts). The expire-gigs cron pauses active gigs past it; renew resets it.';

CREATE INDEX IF NOT EXISTS idx_gigs_active_expires_at
  ON public.gigs (expires_at)
  WHERE status = 'active';

-- Per-account ad caps count by poster + type + time.
CREATE INDEX IF NOT EXISTS idx_gigs_poster_listing_created
  ON public.gigs (poster_id, listing_type, created_at DESC);

-- Per-applicant daily cap and the cover-letter duplicate window.
CREATE INDEX IF NOT EXISTS idx_applications_applicant_created
  ON public.applications (applicant_id, created_at DESC);

-- ── 2. Backfill ───────────────────────────────────────────────────────

UPDATE public.gigs
SET expires_at = GREATEST(
  now() + INTERVAL '14 days',
  COALESCE(boosted_at, created_at)
    + CASE WHEN listing_type = 'for_hire' THEN INTERVAL '60 days' ELSE INTERVAL '30 days' END
)
WHERE status = 'active'
  AND expires_at IS NULL;

-- ── 3. Safety-net trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_gig_expires_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'active' AND (
       NEW.expires_at IS NULL
       OR (TG_OP = 'UPDATE'
           AND OLD.status IS DISTINCT FROM 'active'
           AND NEW.expires_at <= now())
     ) THEN
    NEW.expires_at := now()
      + CASE WHEN NEW.listing_type = 'for_hire' THEN INTERVAL '60 days' ELSE INTERVAL '30 days' END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_gig_expires_at ON public.gigs;
CREATE TRIGGER set_gig_expires_at
  BEFORE INSERT OR UPDATE OF status, expires_at ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.set_gig_expires_at();

-- ── 4. Held applications ──────────────────────────────────────────────

-- The API routes set metadata.held themselves; this covers a direct insert.
CREATE OR REPLACE FUNCTION public.hold_spam_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.applicant_id AND p.is_spam IS TRUE) THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('held', 'spam_review');
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS hold_spam_application ON public.applications;
CREATE TRIGGER hold_spam_application
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.hold_spam_application();

-- Same as prod's definition (pg_get_functiondef, 2026-10-06) plus the held skip.
CREATE OR REPLACE FUNCTION public.notify_on_new_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    gig_record RECORD;
    applicant_record RECORD;
    applicant_label TEXT;
BEGIN
    -- Held for spam review: the poster is not told about it.
    IF NEW.metadata ->> 'held' IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT g.title, g.poster_id INTO gig_record
    FROM gigs g WHERE g.id = NEW.gig_id;

    -- Get applicant name for a better notification message
    SELECT p.full_name, p.username INTO applicant_record
    FROM profiles p WHERE p.id = NEW.applicant_id;

    applicant_label := COALESCE(applicant_record.full_name, applicant_record.username, 'Someone');

    PERFORM create_notification(
        gig_record.poster_id,
        'new_application',
        'New Application',
        applicant_label || ' applied to "' || gig_record.title || '"',
        jsonb_build_object(
            'gig_id', NEW.gig_id,
            'application_id', NEW.id,
            'applicant_id', NEW.applicant_id
        )
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_application_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.metadata ->> 'held' IS NOT NULL THEN
        RETURN NEW;
    END IF;
    UPDATE public.gigs SET applications_count = applications_count + 1 WHERE id = NEW.gig_id;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrement_application_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF OLD.metadata ->> 'held' IS NOT NULL THEN
        RETURN OLD;
    END IF;
    UPDATE public.gigs SET applications_count = applications_count - 1 WHERE id = OLD.gig_id;
    RETURN OLD;
END;
$function$;
