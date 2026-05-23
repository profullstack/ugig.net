-- Store CoinPay in-app payment details for bounty payouts so creators can pay
-- inside uGig without relying on an external hosted checkout link.
ALTER TABLE bounty_submissions
  ADD COLUMN IF NOT EXISTS payment_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN bounty_submissions.payment_metadata IS
  'CoinPay in-app payment details for bounty payout requests: payment_address, amount_crypto, payment_currency, checkout_url, expires_at.';
