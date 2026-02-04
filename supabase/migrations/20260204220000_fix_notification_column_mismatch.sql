-- Fix column mismatch: create_notification() references "message" column
-- but the notifications table (from 001_initial_schema.sql) has "body".
-- Also fix type cast: column uses notification_type enum but function passes TEXT.
-- These caused on_new_message trigger to fail and roll back message inserts.

CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (p_user_id, p_type::notification_type, p_title, p_message, p_data)
    RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
