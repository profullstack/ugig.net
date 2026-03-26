-- Funding system: credits, lifetime plan, funding payments, rewards log
-- Per docs/funding.md PRD

-- =============================================
-- Extend subscription_plan enum to include 'lifetime'
-- =============================================
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'lifetime';

-- =============================================
-- Add credits column to profiles
-- =============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits bigint NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD CONSTRAINT chk_profiles_credits_non_negative CHECK (credits >= 0);

-- =============================================
-- FUNDING PAYMENTS TABLE
-- Separate from the existing payments table (CoinPayPortal)
-- =============================================
CREATE TABLE IF NOT EXISTS funding_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_hash text UNIQUE NOT NULL,
  bolt11 text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('credits_100k', 'credits_500k', 'credits_1m', 'lifetime', 'supporter')),
  amount_sats bigint NOT NULL,
  amount_usd numeric(10,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_funding_payments_user_id ON funding_payments(user_id);
CREATE INDEX idx_funding_payments_status ON funding_payments(status);
CREATE INDEX idx_funding_payments_payment_hash ON funding_payments(payment_hash);
CREATE INDEX idx_funding_payments_created_at ON funding_payments(created_at DESC);

-- =============================================
-- FUNDING REWARDS LOG
-- =============================================
CREATE TABLE IF NOT EXISTS funding_rewards_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  funding_payment_id uuid REFERENCES funding_payments(id) ON DELETE SET NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('credits', 'lifetime', 'badge')),
  amount bigint,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_funding_rewards_log_user_id ON funding_rewards_log(user_id);
CREATE INDEX idx_funding_rewards_log_payment_id ON funding_rewards_log(funding_payment_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE funding_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_rewards_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own funding payments
CREATE POLICY "Users can view own funding payments"
  ON funding_payments FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own funding payments (via API)
CREATE POLICY "Users can create own funding payments"
  ON funding_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update any funding payment (webhooks)
CREATE POLICY "Service role can update funding payments"
  ON funding_payments FOR UPDATE
  USING (true);

-- Users can view their own rewards log
CREATE POLICY "Users can view own funding rewards"
  ON funding_rewards_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert rewards log
CREATE POLICY "Service role can insert funding rewards"
  ON funding_rewards_log FOR INSERT
  WITH CHECK (true);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER update_funding_payments_updated_at
  BEFORE UPDATE ON funding_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
