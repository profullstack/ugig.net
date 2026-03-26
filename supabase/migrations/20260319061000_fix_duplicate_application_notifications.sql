-- Fix duplicate application notifications.
-- The API routes were inserting generic notifications ("Someone applied to your gig")
-- while the DB trigger also created one with the gig title. Now only the trigger creates
-- notifications. Also improve the trigger to include the applicant's name.

CREATE OR REPLACE FUNCTION notify_on_new_application() RETURNS TRIGGER AS $$
DECLARE
    gig_record RECORD;
    applicant_record RECORD;
    applicant_label TEXT;
BEGIN
    SELECT g.title, g.poster_id INTO gig_record
    FROM gigs g WHERE g.id = NEW.gig_id;

    -- Get applicant name for a better notification message
    SELECT p.full_name, p.username INTO applicant_record
    FROM profiles p WHERE p.id = NEW.applicant_id;

    applicant_label := COALESCE(applicant_record.full_name, applicant_record.username, 'Someone');

    PERFORM create_notification(
        gig_record.poster_id,
        'new_application',
        'New Application',
        applicant_label || ' applied to "' || gig_record.title || '"',
        jsonb_build_object(
            'gig_id', NEW.gig_id,
            'application_id', NEW.id,
            'applicant_id', NEW.applicant_id
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
