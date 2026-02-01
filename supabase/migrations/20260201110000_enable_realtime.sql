-- Enable Supabase Realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS notifications;
