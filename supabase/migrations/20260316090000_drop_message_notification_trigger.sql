-- Drop the DB trigger that creates duplicate notifications for new messages.
-- The API routes already create notifications with the sender's username,
-- so this trigger was causing duplicate notifications.
DROP TRIGGER IF EXISTS on_new_message ON messages;
DROP FUNCTION IF EXISTS notify_on_new_message();
