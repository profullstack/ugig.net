-- Fix Supabase security warnings
-- 1. Set search_path on all functions to prevent search path injection
-- 2. Fix overly permissive RLS policies

-- =============================================
-- FIX FUNCTION SEARCH_PATH FOR ALL FUNCTIONS
-- =============================================

-- Fix update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix update_work_history_updated_at
CREATE OR REPLACE FUNCTION public.update_work_history_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix increment_application_count
CREATE OR REPLACE FUNCTION public.increment_application_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE public.gigs SET applications_count = applications_count + 1 WHERE id = NEW.gig_id;
    RETURN NEW;
END;
$$;

-- Fix decrement_application_count
CREATE OR REPLACE FUNCTION public.decrement_application_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE public.gigs SET applications_count = applications_count - 1 WHERE id = OLD.gig_id;
    RETURN OLD;
END;
$$;

-- Fix update_conversation_last_message
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    UPDATE public.conversations SET last_message_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

-- Fix increment_gig_usage
CREATE OR REPLACE FUNCTION public.increment_gig_usage(
    p_user_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.gig_usage
    SET posts_count = posts_count + 1
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;
END;
$$;

-- Fix increment_gig_usage_for_active
CREATE OR REPLACE FUNCTION public.increment_gig_usage_for_active(
    p_user_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.gig_usage (user_id, month, year, posts_count)
    VALUES (p_user_id, p_month, p_year, 1)
    ON CONFLICT (user_id, month, year)
    DO UPDATE SET posts_count = gig_usage.posts_count + 1;
END;
$$;

-- Fix decrement_gig_usage
CREATE OR REPLACE FUNCTION public.decrement_gig_usage(
    p_user_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.gig_usage
    SET posts_count = GREATEST(posts_count - 1, 0)
    WHERE user_id = p_user_id
      AND month = p_month
      AND year = p_year;
END;
$$;

-- Fix create_notification
CREATE OR REPLACE FUNCTION public.create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (p_user_id, p_type, p_title, p_message, p_data)
    RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$;

-- Fix notify_on_new_application
CREATE OR REPLACE FUNCTION public.notify_on_new_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    gig_record RECORD;
BEGIN
    SELECT g.title, g.poster_id INTO gig_record
    FROM public.gigs g WHERE g.id = NEW.gig_id;

    PERFORM public.create_notification(
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
$$;

-- Fix notify_on_application_status_change
CREATE OR REPLACE FUNCTION public.notify_on_application_status_change()
RETURNS TRIGGER
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
    FROM public.gigs g WHERE g.id = NEW.gig_id;

    CASE NEW.status
        WHEN 'shortlisted' THEN status_message := 'You''ve been shortlisted for "' || gig_record.title || '"';
        WHEN 'accepted' THEN status_message := 'Congratulations! Your application for "' || gig_record.title || '" has been accepted';
        WHEN 'rejected' THEN status_message := 'Your application for "' || gig_record.title || '" was not selected';
        ELSE RETURN NEW;
    END CASE;

    PERFORM public.create_notification(
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
$$;

-- Fix notify_on_new_message
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    sender_record RECORD;
    recipient_id UUID;
    participant UUID;
BEGIN
    SELECT p.full_name, p.username INTO sender_record
    FROM public.profiles p WHERE p.id = NEW.sender_id;

    -- Get the conversation to find the other participant
    FOR participant IN
        SELECT unnest(c.participant_ids)
        FROM public.conversations c
        WHERE c.id = NEW.conversation_id
    LOOP
        IF participant != NEW.sender_id THEN
            recipient_id := participant;
            EXIT;
        END IF;
    END LOOP;

    IF recipient_id IS NOT NULL THEN
        PERFORM public.create_notification(
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
$$;

-- Fix notify_on_new_review
CREATE OR REPLACE FUNCTION public.notify_on_new_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    reviewer_record RECORD;
BEGIN
    SELECT p.full_name, p.username INTO reviewer_record
    FROM public.profiles p WHERE p.id = NEW.reviewer_id;

    PERFORM public.create_notification(
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
$$;

-- Fix update_profile_rating
CREATE OR REPLACE FUNCTION public.update_profile_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Update the reviewee's profile
    UPDATE public.profiles
    SET
        average_rating = (
            SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
            FROM public.reviews
            WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id)
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM public.reviews
            WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.reviewee_id, OLD.reviewee_id);

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Fix get_user_rating
CREATE OR REPLACE FUNCTION public.get_user_rating(p_user_id UUID)
RETURNS TABLE (
    average_rating NUMERIC,
    total_reviews BIGINT
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(ROUND(AVG(r.rating)::NUMERIC, 1), 0) as average_rating,
        COUNT(*) as total_reviews
    FROM public.reviews r
    WHERE r.reviewee_id = p_user_id;
END;
$$;

-- =============================================
-- FIX OVERLY PERMISSIVE RLS POLICIES
-- =============================================

-- Fix gig_usage: Remove the overly permissive "System can manage usage" policy
-- The SECURITY DEFINER functions (increment_gig_usage, etc.) bypass RLS,
-- so we don't need a permissive policy. Users should only manage their own usage.
DROP POLICY IF EXISTS "System can manage usage" ON public.gig_usage;

-- Ensure users can only manage their own gig_usage records
DROP POLICY IF EXISTS "Users can insert own usage" ON public.gig_usage;
CREATE POLICY "Users can insert own usage"
    ON public.gig_usage FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own usage" ON public.gig_usage;
CREATE POLICY "Users can update own usage"
    ON public.gig_usage FOR UPDATE
    USING (auth.uid() = user_id);

-- Fix notifications: Remove the overly permissive "System can insert notifications" policy
-- The SECURITY DEFINER function create_notification() bypasses RLS,
-- so we don't need a permissive INSERT policy.
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Note: auth_leaked_password_protection must be enabled in Supabase Dashboard:
-- Go to Authentication > Providers > Email > Enable "Leaked Password Protection"
