-- Fix application status notification trigger to use valid enum value
-- The trigger was building 'application_' || status which creates invalid types like 'application_accepted'
-- The correct type is 'application_status'

CREATE OR REPLACE FUNCTION notify_on_application_status_change() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        WHEN 'reviewing' THEN status_message := 'Your application for "' || gig_record.title || '" is being reviewed';
        ELSE RETURN NEW;
    END CASE;

    -- Use 'application_status' which is a valid notification_type enum value
    PERFORM create_notification(
        NEW.applicant_id,
        'application_status',
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
$$;
