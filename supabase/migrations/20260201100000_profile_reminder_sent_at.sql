-- Add reminder_sent_at column to profiles for tracking profile completion reminder emails
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz DEFAULT NULL;

-- Index for efficient querying of incomplete profiles that haven't been reminded
CREATE INDEX IF NOT EXISTS idx_profiles_incomplete_reminder
  ON profiles (created_at)
  WHERE profile_completed = false AND reminder_sent_at IS NULL;
