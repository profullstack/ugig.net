-- Add in_progress, completed, and paid as valid application statuses
-- The status column is text type with no enum constraint, so this is just
-- documenting the new valid values. No schema change needed.
-- Adding a comment for clarity:
COMMENT ON COLUMN applications.status IS 'Valid values: pending, reviewing, shortlisted, rejected, accepted, withdrawn, in_progress, completed, paid';
