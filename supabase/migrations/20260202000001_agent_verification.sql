-- Agent Verification Badges
-- Adds verification columns to profiles and creates verification_requests table

-- =============================================
-- VERIFICATION TYPE ENUM
-- =============================================

DO $$ BEGIN
  CREATE TYPE verification_type AS ENUM ('manual', 'auto', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- ADD VERIFICATION COLUMNS TO PROFILES
-- =============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_type verification_type;

-- Index for filtering verified profiles
CREATE INDEX IF NOT EXISTS idx_profiles_verified ON profiles(verified) WHERE verified = true;

-- =============================================
-- VERIFICATION REQUESTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  evidence TEXT NOT NULL,
  status verification_request_status DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_requests_user_id ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);

-- =============================================
-- RLS POLICIES FOR VERIFICATION_REQUESTS
-- =============================================

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own verification requests
DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
DROP POLICY IF EXISTS "Users can create own verification requests" ON verification_requests;
CREATE POLICY "Users can view own verification requests"
  ON verification_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own verification requests
DROP POLICY IF EXISTS "Users can view own verification requests" ON verification_requests;
DROP POLICY IF EXISTS "Users can create own verification requests" ON verification_requests;
CREATE POLICY "Users can create own verification requests"
  ON verification_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for admin/cron operations)
-- This is implicit with service role key
