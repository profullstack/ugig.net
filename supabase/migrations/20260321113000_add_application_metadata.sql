-- Add metadata column to applications for storing tx_id, payment info, etc.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
