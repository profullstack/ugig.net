-- Add last_active_at to profiles for message email notification throttling
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient inactivity lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at ON profiles(last_active_at);
