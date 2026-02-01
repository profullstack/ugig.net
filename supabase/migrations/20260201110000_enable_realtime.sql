-- Enable Supabase Realtime for tables that need live updates
-- Note: IF NOT EXISTS not supported for ALTER PUBLICATION, wrap in DO block
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
