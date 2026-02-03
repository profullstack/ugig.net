-- Migration: Fix Supabase security linter warnings
-- 1. Set search_path = '' on functions to prevent search path manipulation attacks
-- 2. Fix overly permissive RLS policies

-- =============================================
-- 1. FIX FUNCTION SEARCH PATHS
-- =============================================

-- Fix get_api_key_user
CREATE OR REPLACE FUNCTION public.get_api_key_user(p_key_prefix TEXT)
RETURNS TABLE (
  user_id UUID,
  key_hash TEXT,
  key_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.user_id,
    ak.key_hash,
    ak.id as key_id
  FROM public.api_keys ak
  WHERE ak.key_prefix = p_key_prefix
    AND ak.revoked_at IS NULL
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW());
END;
$$;

-- Fix update_api_key_last_used
CREATE OR REPLACE FUNCTION public.update_api_key_last_used(p_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.api_keys
  SET last_used_at = NOW()
  WHERE id = p_key_id;
END;
$$;

-- Fix update_portfolio_items_updated_at
CREATE OR REPLACE FUNCTION public.update_portfolio_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix create_gig_posted_activity
CREATE OR REPLACE FUNCTION public.create_gig_posted_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO public.activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
    VALUES (
      NEW.poster_id,
      'gig_posted',
      NEW.id,
      'gig',
      jsonb_build_object('gig_title', NEW.title, 'category', NEW.category),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Fix create_gig_completed_activity
CREATE OR REPLACE FUNCTION public.create_gig_completed_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'filled' AND (OLD.status IS NULL OR OLD.status != 'filled') THEN
    INSERT INTO public.activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
    VALUES (
      NEW.poster_id,
      'gig_completed',
      NEW.id,
      'gig',
      jsonb_build_object('gig_title', NEW.title, 'category', NEW.category),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Fix create_gig_applied_activity
CREATE OR REPLACE FUNCTION public.create_gig_applied_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  gig_title TEXT;
  gig_category TEXT;
BEGIN
  SELECT title, category INTO gig_title, gig_category FROM public.gigs WHERE id = NEW.gig_id;
  
  INSERT INTO public.activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
  VALUES (
    NEW.applicant_id,
    'gig_applied',
    NEW.gig_id,
    'gig',
    jsonb_build_object('gig_title', gig_title, 'category', gig_category, 'application_id', NEW.id),
    false
  );
  RETURN NEW;
END;
$$;

-- Fix create_review_activity
CREATE OR REPLACE FUNCTION public.create_review_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  gig_title TEXT;
  reviewer_name TEXT;
  reviewee_name TEXT;
BEGIN
  SELECT title INTO gig_title FROM public.gigs WHERE id = NEW.gig_id;
  SELECT COALESCE(full_name, username) INTO reviewer_name FROM public.profiles WHERE id = NEW.reviewer_id;
  SELECT COALESCE(full_name, username) INTO reviewee_name FROM public.profiles WHERE id = NEW.reviewee_id;
  
  -- Activity for reviewer (gave a review)
  INSERT INTO public.activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
  VALUES (
    NEW.reviewer_id,
    'review_given',
    NEW.id,
    'review',
    jsonb_build_object('gig_title', gig_title, 'rating', NEW.rating, 'reviewee_name', reviewee_name, 'gig_id', NEW.gig_id),
    true
  );
  
  -- Activity for reviewee (received a review)
  INSERT INTO public.activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
  VALUES (
    NEW.reviewee_id,
    'review_received',
    NEW.id,
    'review',
    jsonb_build_object('gig_title', gig_title, 'rating', NEW.rating, 'reviewer_name', reviewer_name, 'gig_id', NEW.gig_id),
    true
  );
  
  RETURN NEW;
END;
$$;

-- Fix update_follow_counts
CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
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
SET search_path = ''
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

-- =============================================
-- 2. FIX OVERLY PERMISSIVE RLS POLICIES
-- =============================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Service role can insert activities" ON public.activities;
DROP POLICY IF EXISTS "Service can insert webhook deliveries" ON public.webhook_deliveries;

-- Recreate with proper restrictions
-- These policies allow inserts only when there's no authenticated user (i.e., service role or trigger context)
CREATE POLICY "Service role can insert activities"
  ON public.activities FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

CREATE POLICY "Service can insert webhook deliveries"
  ON public.webhook_deliveries FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

-- =============================================
-- 3. NOTE: Leaked Password Protection
-- =============================================
-- The "Leaked Password Protection Disabled" warning must be fixed in the
-- Supabase Dashboard: Authentication > Settings > Enable "Leaked password protection"
-- This cannot be done via SQL migration.
