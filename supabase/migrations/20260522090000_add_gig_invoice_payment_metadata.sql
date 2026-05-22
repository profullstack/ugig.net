ALTER TABLE gig_invoices
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN gig_invoices.metadata IS
  'In-app CoinPay payment details for gig invoices, such as payment address, crypto amount, payment currency, checkout URL, and expiration.';
