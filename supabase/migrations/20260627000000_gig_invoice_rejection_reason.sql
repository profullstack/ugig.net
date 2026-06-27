-- Let the payer attach an optional note when rejecting an invoice
-- (e.g. "need links to the merged PR"). Surfaced to the worker who sent it.
ALTER TABLE gig_invoices
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN gig_invoices.rejection_reason IS
  'Optional message the payer left when rejecting an invoice, shown to the worker.';
