-- application_status never got the work-tracking states.
--
-- 20260321112600_add_application_statuses.sql assumed applications.status was
-- text and only added a COMMENT. It is the application_status ENUM, so every
-- write of in_progress / completed / paid has failed with
-- "invalid input value for enum application_status" since March:
--   * the poster's "Mark In Progress / Completed / Paid" buttons (400)
--   * the CoinPay webhook on a funded escrow (-> in_progress) and on a paid
--     gig invoice (-> completed), whose results were never checked
--   * escrow release (-> completed)
--
-- ADD VALUE IF NOT EXISTS is additive and idempotent; no existing row changes.
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'paid';

COMMENT ON COLUMN public.applications.status IS
  'application_status enum: pending, reviewing, shortlisted, rejected, accepted, withdrawn, in_progress, completed, paid. accepted/in_progress/completed/paid all mean "hired" (src/lib/application-status.ts).';
