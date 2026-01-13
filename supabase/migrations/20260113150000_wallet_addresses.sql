-- Add wallet_addresses column to profiles table
-- Stores array of wallet addresses for crypto payments

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wallet_addresses JSONB DEFAULT '[]'::jsonb;

-- Add a check constraint to ensure proper structure
-- Each wallet should have: currency (string), address (string), is_preferred (boolean)
ALTER TABLE profiles
ADD CONSTRAINT wallet_addresses_valid CHECK (
  wallet_addresses IS NULL OR (
    jsonb_typeof(wallet_addresses) = 'array' AND
    jsonb_array_length(wallet_addresses) <= 10
  )
);

-- Create an index for querying by preferred wallet
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_addresses ON profiles USING GIN (wallet_addresses);

COMMENT ON COLUMN profiles.wallet_addresses IS 'Array of crypto wallet addresses: [{currency: string, address: string, is_preferred: boolean}]';
