-- Notification settings table for email preferences
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email_new_message boolean NOT NULL DEFAULT true,
  email_new_comment boolean NOT NULL DEFAULT true,
  email_new_follower boolean NOT NULL DEFAULT true,
  email_new_application boolean NOT NULL DEFAULT true,
  email_application_status boolean NOT NULL DEFAULT true,
  email_review_received boolean NOT NULL DEFAULT true,
  email_endorsement_received boolean NOT NULL DEFAULT true,
  email_gig_updates boolean NOT NULL DEFAULT true,
  email_mention boolean NOT NULL DEFAULT true,
  email_upvote_milestone boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification settings" ON notification_settings;
CREATE POLICY "Users can view own notification settings" ON notification_settings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification settings" ON notification_settings;
CREATE POLICY "Users can insert own notification settings" ON notification_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification settings" ON notification_settings;
CREATE POLICY "Users can update own notification settings" ON notification_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can read any user's settings (for email sending)
DROP POLICY IF EXISTS "Service role can read all notification settings" ON notification_settings;
CREATE POLICY "Service role can read all notification settings" ON notification_settings
  FOR SELECT USING (auth.role() = 'service_role');
