-- ugig.net Row Level Security Policies
-- Run this after 001_initial_schema.sql

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_calls ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES POLICIES
-- =============================================

-- Anyone can view public profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- =============================================
-- GIGS POLICIES
-- =============================================

-- Anyone can view active gigs (public listing)
CREATE POLICY "Active gigs are viewable by everyone"
  ON gigs FOR SELECT
  USING (status = 'active' OR poster_id = auth.uid());

-- Authenticated users can create gigs
CREATE POLICY "Authenticated users can create gigs"
  ON gigs FOR INSERT
  WITH CHECK (auth.uid() = poster_id);

-- Gig owners can update their gigs
CREATE POLICY "Gig owners can update their gigs"
  ON gigs FOR UPDATE
  USING (auth.uid() = poster_id);

-- Gig owners can delete their gigs
CREATE POLICY "Gig owners can delete their gigs"
  ON gigs FOR DELETE
  USING (auth.uid() = poster_id);

-- =============================================
-- APPLICATIONS POLICIES
-- =============================================

-- Applicants can view their own applications
CREATE POLICY "Applicants can view their own applications"
  ON applications FOR SELECT
  USING (
    auth.uid() = applicant_id
    OR auth.uid() IN (SELECT poster_id FROM gigs WHERE id = applications.gig_id)
  );

-- Authenticated users can create applications (not on own gigs)
CREATE POLICY "Users can apply to gigs"
  ON applications FOR INSERT
  WITH CHECK (
    auth.uid() = applicant_id
    AND auth.uid() NOT IN (SELECT poster_id FROM gigs WHERE id = gig_id)
  );

-- Applicants can update their own applications (withdraw)
CREATE POLICY "Applicants can update their applications"
  ON applications FOR UPDATE
  USING (auth.uid() = applicant_id);

-- Gig owners can update application status
CREATE POLICY "Gig owners can update application status"
  ON applications FOR UPDATE
  USING (auth.uid() IN (SELECT poster_id FROM gigs WHERE id = applications.gig_id));

-- =============================================
-- SUBSCRIPTIONS POLICIES
-- =============================================

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own subscription (via service role for Stripe webhooks)
CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================
-- GIG USAGE POLICIES
-- =============================================

-- Users can view their own usage
CREATE POLICY "Users can view own gig usage"
  ON gig_usage FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert usage records (via triggers/functions)
CREATE POLICY "Users can track own usage"
  ON gig_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- System can update usage records
CREATE POLICY "Users can update own usage"
  ON gig_usage FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================
-- CONVERSATIONS POLICIES
-- =============================================

-- Participants can view their conversations
CREATE POLICY "Participants can view their conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = ANY(participant_ids));

-- Users can create conversations they participate in
CREATE POLICY "Users can create conversations they participate in"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = ANY(participant_ids));

-- =============================================
-- MESSAGES POLICIES
-- =============================================

-- Conversation participants can view messages
CREATE POLICY "Conversation participants can view messages"
  ON messages FOR SELECT
  USING (
    auth.uid() IN (
      SELECT unnest(participant_ids) FROM conversations WHERE id = messages.conversation_id
    )
  );

-- Conversation participants can send messages
CREATE POLICY "Conversation participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() IN (
      SELECT unnest(participant_ids) FROM conversations WHERE id = conversation_id
    )
  );

-- Participants can update read status
CREATE POLICY "Participants can update message read status"
  ON messages FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT unnest(participant_ids) FROM conversations WHERE id = messages.conversation_id
    )
  );

-- =============================================
-- REVIEWS POLICIES
-- =============================================

-- Anyone can view reviews
CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT
  USING (true);

-- Users can create reviews for gigs they were involved in
CREATE POLICY "Users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- =============================================
-- NOTIFICATIONS POLICIES
-- =============================================

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- VIDEO CALLS POLICIES
-- =============================================

-- Participants can view their video calls
CREATE POLICY "Participants can view their video calls"
  ON video_calls FOR SELECT
  USING (auth.uid() = ANY(participant_ids) OR auth.uid() = initiator_id);

-- Users can create video calls
CREATE POLICY "Users can create video calls"
  ON video_calls FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);

-- Participants can update video calls (start/end)
CREATE POLICY "Participants can update video calls"
  ON video_calls FOR UPDATE
  USING (auth.uid() = ANY(participant_ids) OR auth.uid() = initiator_id);
