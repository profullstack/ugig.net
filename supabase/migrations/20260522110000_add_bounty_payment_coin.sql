-- Let bounty creators specify which crypto they'll pay approved submitters
-- in, matching the payment_coin pattern already used on gigs. Amount stays
-- denominated in USD; payment_coin selects the crypto for the CoinPay payout.

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS payment_coin text;

COMMENT ON COLUMN bounties.payment_coin IS
  'Crypto symbol (BTC, SOL, ETH, USDC, USDT, POL, SATS, LN) the creator will use to pay approved submissions. NULL means fiat/negotiable.';
