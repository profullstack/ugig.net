-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

-- System/triggers can insert notifications for any user
CREATE POLICY "System can insert notifications"
    ON notifications FOR INSERT
    WITH CHECK (true);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = user_id);

-- Function to create notification
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
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (p_user_id, p_type, p_title, p_message, p_data)
    RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create notification on new application
CREATE OR REPLACE FUNCTION notify_on_new_application() RETURNS TRIGGER AS $$
DECLARE
    gig_record RECORD;
BEGIN
    SELECT g.title, g.poster_id INTO gig_record
    FROM gigs g WHERE g.id = NEW.gig_id;

    PERFORM create_notification(
        gig_record.poster_id,
        'new_application',
        'New Application',
        'You have a new application for "' || gig_record.title || '"',
        jsonb_build_object(
            'gig_id', NEW.gig_id,
            'application_id', NEW.id,
            'applicant_id', NEW.applicant_id
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_application ON applications;
CREATE TRIGGER on_new_application
    AFTER INSERT ON applications
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_new_application();

-- Trigger to notify applicant on status change
CREATE OR REPLACE FUNCTION notify_on_application_status_change() RETURNS TRIGGER AS $$
DECLARE
    gig_record RECORD;
    status_message TEXT;
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    SELECT g.title INTO gig_record
    FROM gigs g WHERE g.id = NEW.gig_id;

    CASE NEW.status
        WHEN 'shortlisted' THEN status_message := 'You''ve been shortlisted for "' || gig_record.title || '"';
        WHEN 'accepted' THEN status_message := 'Congratulations! Your application for "' || gig_record.title || '" has been accepted';
        WHEN 'rejected' THEN status_message := 'Your application for "' || gig_record.title || '" was not selected';
        ELSE RETURN NEW;
    END CASE;

    PERFORM create_notification(
        NEW.applicant_id,
        'application_' || NEW.status,
        'Application Update',
        status_message,
        jsonb_build_object(
            'gig_id', NEW.gig_id,
            'application_id', NEW.id,
            'status', NEW.status
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_application_status_change ON applications;
CREATE TRIGGER on_application_status_change
    AFTER UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_application_status_change();

-- Trigger to notify on new message
CREATE OR REPLACE FUNCTION notify_on_new_message() RETURNS TRIGGER AS $$
DECLARE
    sender_record RECORD;
    recipient_id UUID;
    participant UUID;
BEGIN
    SELECT p.full_name, p.username INTO sender_record
    FROM profiles p WHERE p.id = NEW.sender_id;

    -- Get the conversation to find the other participant
    FOR participant IN
        SELECT unnest(c.participant_ids)
        FROM conversations c
        WHERE c.id = NEW.conversation_id
    LOOP
        IF participant != NEW.sender_id THEN
            recipient_id := participant;
            EXIT;
        END IF;
    END LOOP;

    IF recipient_id IS NOT NULL THEN
        PERFORM create_notification(
            recipient_id,
            'new_message',
            'New Message',
            COALESCE(sender_record.full_name, sender_record.username, 'Someone') || ' sent you a message',
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_id', NEW.sender_id
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_message ON messages;
CREATE TRIGGER on_new_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_new_message();

-- Trigger to notify on new review
CREATE OR REPLACE FUNCTION notify_on_new_review() RETURNS TRIGGER AS $$
DECLARE
    reviewer_record RECORD;
BEGIN
    SELECT p.full_name, p.username INTO reviewer_record
    FROM profiles p WHERE p.id = NEW.reviewer_id;

    PERFORM create_notification(
        NEW.reviewee_id,
        'new_review',
        'New Review',
        COALESCE(reviewer_record.full_name, reviewer_record.username, 'Someone') || ' left you a ' || NEW.rating || '-star review',
        jsonb_build_object(
            'review_id', NEW.id,
            'reviewer_id', NEW.reviewer_id,
            'rating', NEW.rating
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_review ON reviews;
CREATE TRIGGER on_new_review
    AFTER INSERT ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_new_review();
