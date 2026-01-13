-- Payments Schema for CoinPayPortal Integration
-- Run this in Supabase SQL Editor after the initial schema

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'forwarded', 'expired', 'failed');
CREATE TYPE payment_type AS ENUM ('subscription', 'gig_payment', 'tip');

-- Add payment_received to notification_type
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_received';

-- =============================================
-- PAYMENTS TABLE
-- =============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coinpay_payment_id TEXT UNIQUE,
  stripe_payment_id TEXT UNIQUE,
  amount_usd DECIMAL(10, 2) NOT NULL,
  amount_crypto DECIMAL(20, 10),
  currency TEXT NOT NULL,
  status payment_status DEFAULT 'pending',
  type payment_type NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_coinpay_id ON payments(coinpay_payment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- =============================================
-- UPDATE SUBSCRIPTIONS TABLE
-- =============================================

-- Add coinpay_payment_id column to subscriptions
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS coinpay_payment_id TEXT;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own payments
CREATE POLICY "Users can create own payments"
  ON payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update any payment (for webhooks)
CREATE POLICY "Service role can update payments"
  ON payments FOR UPDATE
  USING (auth.role() = 'service_role');

-- =============================================
-- TRIGGERS
-- =============================================

-- Update updated_at on payments
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
