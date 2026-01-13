-- ugig.net Database Schema
-- Run this in Supabase SQL Editor

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE budget_type AS ENUM ('fixed', 'hourly');
CREATE TYPE location_type AS ENUM ('remote', 'onsite', 'hybrid');
CREATE TYPE gig_status AS ENUM ('draft', 'active', 'paused', 'closed', 'filled');
CREATE TYPE application_status AS ENUM ('pending', 'reviewing', 'shortlisted', 'rejected', 'accepted', 'withdrawn');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');
CREATE TYPE subscription_plan AS ENUM ('free', 'pro');
CREATE TYPE notification_type AS ENUM ('new_application', 'application_status', 'new_message', 'call_scheduled', 'review_received', 'gig_update');

-- =============================================
-- PROFILES TABLE
-- =============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  skills TEXT[] DEFAULT '{}',
  ai_tools TEXT[] DEFAULT '{}',
  hourly_rate DECIMAL(10, 2),
  portfolio_urls TEXT[] DEFAULT '{}',
  location TEXT,
  timezone TEXT,
  is_available BOOLEAN DEFAULT true,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on username for fast lookups
CREATE INDEX idx_profiles_username ON profiles(username);

-- =============================================
-- GIGS TABLE
-- =============================================

CREATE TABLE gigs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  skills_required TEXT[] DEFAULT '{}',
  ai_tools_preferred TEXT[] DEFAULT '{}',
  budget_type budget_type NOT NULL,
  budget_min DECIMAL(10, 2),
  budget_max DECIMAL(10, 2),
  duration TEXT,
  location_type location_type DEFAULT 'remote',
  location TEXT,
  status gig_status DEFAULT 'draft',
  applications_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for gig searches
CREATE INDEX idx_gigs_poster_id ON gigs(poster_id);
CREATE INDEX idx_gigs_category ON gigs(category);
CREATE INDEX idx_gigs_status ON gigs(status);
CREATE INDEX idx_gigs_created_at ON gigs(created_at DESC);

-- Full-text search index
CREATE INDEX idx_gigs_search ON gigs USING GIN (to_tsvector('english', title || ' ' || description));

-- =============================================
-- APPLICATIONS TABLE
-- =============================================

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cover_letter TEXT NOT NULL,
  proposed_rate DECIMAL(10, 2),
  proposed_timeline TEXT,
  portfolio_items TEXT[] DEFAULT '{}',
  ai_tools_to_use TEXT[] DEFAULT '{}',
  status application_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate applications
  UNIQUE(gig_id, applicant_id)
);

-- Indexes
CREATE INDEX idx_applications_gig_id ON applications(gig_id);
CREATE INDEX idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX idx_applications_status ON applications(status);

-- =============================================
-- SUBSCRIPTIONS TABLE
-- =============================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status subscription_status DEFAULT 'active',
  plan subscription_plan DEFAULT 'free',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on stripe IDs for webhook lookups
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- =============================================
-- GIG USAGE TABLE (Monthly post tracking)
-- =============================================

CREATE TABLE gig_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2024),
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One record per user per month
  UNIQUE(user_id, month, year)
);

-- Index for looking up user's current month usage
CREATE INDEX idx_gig_usage_user_month ON gig_usage(user_id, year, month);

-- =============================================
-- CONVERSATIONS TABLE
-- =============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_ids UUID[] NOT NULL,
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding user's conversations
CREATE INDEX idx_conversations_participants ON conversations USING GIN (participant_ids);

-- =============================================
-- MESSAGES TABLE
-- =============================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  read_by UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching messages in a conversation
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, created_at DESC);

-- =============================================
-- REVIEWS TABLE
-- =============================================

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- One review per reviewer per gig
  UNIQUE(gig_id, reviewer_id)
);

-- Indexes
CREATE INDEX idx_reviews_reviewee_id ON reviews(reviewee_id);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching user's notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- =============================================
-- VIDEO CALLS TABLE
-- =============================================

CREATE TABLE video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL UNIQUE,
  initiator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_ids UUID[] NOT NULL,
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_gigs_updated_at
  BEFORE UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to increment application count on new application
CREATE OR REPLACE FUNCTION increment_application_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE gigs SET applications_count = applications_count + 1 WHERE id = NEW.gig_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_application_created
  AFTER INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION increment_application_count();

-- Function to decrement application count on deleted application
CREATE OR REPLACE FUNCTION decrement_application_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE gigs SET applications_count = applications_count - 1 WHERE id = OLD.gig_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_application_deleted
  AFTER DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION decrement_application_count();

-- Function to create profile and subscription on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
  );

  -- Create free subscription
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET last_message_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Function to increment gig usage count for free users
CREATE OR REPLACE FUNCTION increment_gig_usage(
  p_user_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE gig_usage
  SET posts_count = posts_count + 1
  WHERE user_id = p_user_id AND month = p_month AND year = p_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
