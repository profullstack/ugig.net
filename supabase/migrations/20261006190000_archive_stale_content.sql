-- Archive stale and spam content without deleting anything.
--
-- 1. `archived` joins gig_status and application_status. An archived row keeps
--    every column, plus archived_at, archived_reason and archived_from_status so
--    an owner (or an admin) can put it back. Public listings, search, the
--    sitemap and the "active"/"pending" stats already filter on status, so an
--    archived row drops out of all of them.
-- 2. gigs.last_activity_at: updated_at cannot answer "is this gig stale?". The
--    expiry backfill (20261006134000) bumped it on every active gig, and the
--    applications_count trigger bumps it on every application. last_activity_at
--    moves only on a real event: an edit to the listing, a status change made by
--    a person, a boost or renewal, a new application, a new comment.
-- 3. archive_stale_content(dry_run, now) does the sweep in one statement per
--    rule. POST /api/cron/archive-stale calls it daily; nobody is emailed or
--    notified (notify_on_application_status_change ignores 'archived').
--
-- Rules (all 30 days, PRD 01 open decision, approved 2026-10-06):
--   gigs   active/paused/closed with no activity for 30 days      -> 'stale'
--   gigs   drafts with no activity for 30 days                     -> 'stale_draft'
--   gigs   any non-filled gig whose poster is is_spam               -> 'spam'
--   apps   pending/reviewing/shortlisted on an archived, closed or
--          filled gig                                              -> 'gig_closed'
--   apps   pending and older than 30 days                          -> 'stale'
--   apps   pending/reviewing/shortlisted from an is_spam applicant -> 'spam'
-- Never touched: filled gigs; gigs with any invoice, escrow or hired
-- application; hired applications; applications with an invoice or escrow.
-- Money stays exactly where it is.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block together with
-- statements that use the new value, so apply this file with plain psql (each
-- statement autocommits), not with --single-transaction.

-- ── 1. Archive state ──────────────────────────────────────────────────

ALTER TYPE public.gig_status ADD VALUE IF NOT EXISTS 'archived';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'archived';

ALTER TABLE public.gigs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_from_status public.gig_status,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_from_status public.application_status;

COMMENT ON COLUMN public.gigs.archived_at IS
  'Set while status = archived. Archived gigs are kept, hidden from listings, search, sitemap and stats; the owner can reactivate.';
COMMENT ON COLUMN public.gigs.archived_reason IS
  'stale | stale_draft | spam | owner';
COMMENT ON COLUMN public.gigs.last_activity_at IS
  'Last real event on the gig (edit, human status change, boost, renewal, application, comment). Drives archive_stale_content().';
COMMENT ON COLUMN public.applications.archived_reason IS
  'stale | gig_closed | spam';

-- ── 2. last_activity_at ───────────────────────────────────────────────

-- Backfill. updated_at only counts for gigs that were not active on
-- 2026-10-06, because the expiry backfill touched every active one that day.
-- The updated_at trigger is suspended so this backfill does not bump it again.
ALTER TABLE public.gigs DISABLE TRIGGER update_gigs_updated_at;
UPDATE public.gigs g
SET last_activity_at = GREATEST(
  g.created_at,
  g.boosted_at,
  CASE WHEN g.status <> 'active' THEN g.updated_at END,
  (SELECT max(a.created_at) FROM public.applications a WHERE a.gig_id = g.id),
  (SELECT max(c.created_at) FROM public.gig_comments c WHERE c.gig_id = g.id)
)
WHERE g.last_activity_at IS NULL;
ALTER TABLE public.gigs ENABLE TRIGGER update_gigs_updated_at;

ALTER TABLE public.gigs ALTER COLUMN last_activity_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_gigs_last_activity_at
  ON public.gigs (last_activity_at);

-- Runs after set_gig_expires_at (BEFORE triggers fire in name order).
CREATE OR REPLACE FUNCTION public.track_gig_activity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Archive bookkeeping: entering archived records where it came from,
  -- leaving it clears the trail.
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
    NEW.archived_at := COALESCE(NEW.archived_at, now());
    NEW.archived_from_status := COALESCE(NEW.archived_from_status, OLD.status);
    NEW.archived_reason := COALESCE(NEW.archived_reason, 'owner');
    RETURN NEW; -- archiving is not activity
  ELSIF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    NEW.archived_at := NULL;
    NEW.archived_from_status := NULL;
    NEW.archived_reason := NULL;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.skills_required IS DISTINCT FROM OLD.skills_required
     OR NEW.budget_type IS DISTINCT FROM OLD.budget_type
     OR NEW.budget_min IS DISTINCT FROM OLD.budget_min
     OR NEW.budget_max IS DISTINCT FROM OLD.budget_max
     OR NEW.boosted_at IS DISTINCT FROM OLD.boosted_at
     -- The expiry cron's active -> paused is not a person doing something.
     OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'paused')
     -- Renewing an active gig only moves expires_at.
     OR (NEW.status = 'active' AND NEW.expires_at IS DISTINCT FROM OLD.expires_at
         AND OLD.status = 'active')
  THEN
    NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS track_gig_activity ON public.gigs;
CREATE TRIGGER track_gig_activity
  BEFORE UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.track_gig_activity();

CREATE OR REPLACE FUNCTION public.touch_gig_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Held spam applications are not activity on the gig.
  IF TG_TABLE_NAME = 'applications' AND NEW.metadata ->> 'held' IS NOT NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.gigs SET last_activity_at = now() WHERE id = NEW.gig_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS touch_gig_activity ON public.applications;
CREATE TRIGGER touch_gig_activity
  AFTER INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_gig_activity();

DROP TRIGGER IF EXISTS touch_gig_activity ON public.gig_comments;
CREATE TRIGGER touch_gig_activity
  AFTER INSERT ON public.gig_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_gig_activity();

-- Applications get the same archive bookkeeping.
CREATE OR REPLACE FUNCTION public.track_application_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
    NEW.archived_at := COALESCE(NEW.archived_at, now());
    NEW.archived_from_status := COALESCE(NEW.archived_from_status, OLD.status);
  ELSIF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    NEW.archived_at := NULL;
    NEW.archived_from_status := NULL;
    NEW.archived_reason := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS track_application_archive ON public.applications;
CREATE TRIGGER track_application_archive
  BEFORE UPDATE OF status ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.track_application_archive();

-- ── 3. The sweep ──────────────────────────────────────────────────────

-- What archive_stale_content() would archive right now, without writing.
-- Gig rules run first; the application rules then see those gigs as
-- archived. Also used to take the row backup before the first run.
CREATE OR REPLACE FUNCTION public.archive_stale_candidates(
  p_now TIMESTAMPTZ DEFAULT now(),
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (kind TEXT, id UUID, reason TEXT)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH cutoff AS (
    SELECT p_now - make_interval(days => p_days) AS at
  ),
  money_gigs AS (
    SELECT gig_id FROM gig_invoices
    UNION SELECT gig_id FROM gig_escrows
    UNION SELECT gig_id FROM applications
      WHERE status IN ('accepted', 'in_progress', 'completed', 'paid')
  ),
  gig_hits AS (
    SELECT DISTINCT ON (g.id) g.id,
      CASE
        WHEN p.is_spam IS TRUE THEN 'spam'
        WHEN g.status = 'draft' THEN 'stale_draft'
        ELSE 'stale'
      END AS reason
    FROM gigs g
    JOIN profiles p ON p.id = g.poster_id
    CROSS JOIN cutoff
    WHERE g.status IN ('draft', 'active', 'paused', 'closed')
      AND g.id NOT IN (SELECT gig_id FROM money_gigs)
      AND (
        p.is_spam IS TRUE
        OR COALESCE(g.last_activity_at, g.updated_at, g.created_at) < cutoff.at
      )
  ),
  money_apps AS (
    SELECT application_id FROM gig_invoices
    UNION SELECT application_id FROM gig_escrows
  ),
  app_hits AS (
    SELECT DISTINCT ON (a.id) a.id,
      CASE
        WHEN p.is_spam IS TRUE THEN 'spam'
        WHEN g.status IN ('closed', 'filled', 'archived') OR gh.id IS NOT NULL THEN 'gig_closed'
        ELSE 'stale'
      END AS reason
    FROM applications a
    JOIN gigs g ON g.id = a.gig_id
    JOIN profiles p ON p.id = a.applicant_id
    LEFT JOIN gig_hits gh ON gh.id = a.gig_id
    CROSS JOIN cutoff
    WHERE a.status IN ('pending', 'reviewing', 'shortlisted')
      AND a.id NOT IN (SELECT application_id FROM money_apps)
      AND (
        p.is_spam IS TRUE
        OR g.status IN ('closed', 'filled', 'archived')
        OR gh.id IS NOT NULL
        OR (a.status = 'pending' AND a.created_at < cutoff.at)
      )
  )
  SELECT 'gig', id, reason FROM gig_hits
  UNION ALL
  SELECT 'application', id, reason FROM app_hits;
$function$;

-- Archive everything archive_stale_candidates() lists. Returns counts by kind
-- and reason. With p_dry_run nothing is written.
CREATE OR REPLACE FUNCTION public.archive_stale_content(
  p_dry_run BOOLEAN DEFAULT false,
  p_now TIMESTAMPTZ DEFAULT now(),
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  counts JSONB;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _archive_hits (kind TEXT, id UUID, reason TEXT) ON COMMIT DROP;
  TRUNCATE _archive_hits;
  INSERT INTO _archive_hits SELECT * FROM archive_stale_candidates(p_now, p_days);

  SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) INTO counts
  FROM (
    SELECT kind || ':' || reason AS k, count(*) AS n
    FROM _archive_hits GROUP BY 1
  ) s;

  IF NOT p_dry_run THEN
    UPDATE gigs g
    SET status = 'archived',
        archived_at = p_now,
        archived_reason = h.reason,
        archived_from_status = g.status
    FROM _archive_hits h
    WHERE h.kind = 'gig' AND h.id = g.id
      AND g.status IN ('draft', 'active', 'paused', 'closed');

    UPDATE applications a
    SET status = 'archived',
        archived_at = p_now,
        archived_reason = h.reason,
        archived_from_status = a.status
    FROM _archive_hits h
    WHERE h.kind = 'application' AND h.id = a.id
      AND a.status IN ('pending', 'reviewing', 'shortlisted');
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'cutoff', p_now - make_interval(days => p_days),
    'gigs', (SELECT count(*) FROM _archive_hits WHERE kind = 'gig'),
    'applications', (SELECT count(*) FROM _archive_hits WHERE kind = 'application'),
    'by_reason', counts
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_stale_candidates(TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_stale_content(BOOLEAN, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_stale_candidates(TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_stale_content(BOOLEAN, TIMESTAMPTZ, INTEGER) TO service_role;
