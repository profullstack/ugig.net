-- Fix missing tables in production
-- This migration is idempotent (safe to run multiple times)

-- =============================================
-- ENUMS (create if not exists)
-- =============================================

DO $$ BEGIN
    CREATE TYPE budget_type AS ENUM ('fixed', 'hourly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE location_type AS ENUM ('remote', 'onsite', 'hybrid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gig_status AS ENUM ('draft', 'active', 'paused', 'closed', 'filled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('pending', 'reviewing', 'shortlisted', 'rejected', 'accepted', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_plan AS ENUM ('free', 'pro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('new_application', 'application_status', 'new_message', 'call_scheduled', 'review_received', 'gig_update');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'forwarded', 'expired', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_type AS ENUM ('subscription', 'gig_payment', 'tip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add payment_received to notification_type if not exists
DO $$ BEGIN
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_received';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- PROFILES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS profiles (
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
    average_rating NUMERIC DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- =============================================
-- SUBSCRIPTIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    coinpay_payment_id TEXT,
    status subscription_status DEFAULT 'active',
    plan subscription_plan DEFAULT 'free',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- =============================================
-- GIGS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS gigs (
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

CREATE INDEX IF NOT EXISTS idx_gigs_poster_id ON gigs(poster_id);
CREATE INDEX IF NOT EXISTS idx_gigs_category ON gigs(category);
CREATE INDEX IF NOT EXISTS idx_gigs_status ON gigs(status);
CREATE INDEX IF NOT EXISTS idx_gigs_created_at ON gigs(created_at DESC);

-- =============================================
-- APPLICATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS applications (
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
    UNIQUE(gig_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_gig_id ON applications(gig_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- =============================================
-- CONVERSATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_ids UUID[] NOT NULL,
    gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING GIN (participant_ids);

-- =============================================
-- MESSAGES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    read_by UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, created_at DESC);

-- =============================================
-- GIG USAGE TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS gig_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    posts_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_gig_usage_user_id ON gig_usage(user_id);

-- =============================================
-- PAYMENTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    coinpay_payment_id TEXT UNIQUE,
    stripe_payment_id TEXT UNIQUE,
    amount_usd DECIMAL(10, 2) NOT NULL,
    amount_crypto DECIMAL(20, 10),
    currency TEXT NOT NULL,
    status payment_status DEFAULT 'pending',
    type payment_type NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_coinpay_id ON payments(coinpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- =============================================
-- WORK HISTORY TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS work_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    position TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT false,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_history_user_id ON work_history(user_id);

-- =============================================
-- REVIEWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gig_id, reviewer_id, reviewee_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- =============================================
-- SAVED GIGS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS saved_gigs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, gig_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_gigs_user_id ON saved_gigs(user_id);

-- =============================================
-- VIDEO CALLS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS video_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id TEXT UNIQUE NOT NULL,
    initiator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    participant_ids UUID[] NOT NULL,
    gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL,
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_calls_initiator_id ON video_calls(initiator_id);
CREATE INDEX IF NOT EXISTS idx_video_calls_room_id ON video_calls(room_id);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- HANDLE NEW USER TRIGGER (for signup)
-- =============================================

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
EXCEPTION
    WHEN others THEN
        RAISE LOG 'handle_new_user error: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger to ensure it's attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

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
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_gigs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE USING (auth.uid() = id);

-- Gigs
DROP POLICY IF EXISTS "Active gigs are viewable by everyone" ON gigs;
CREATE POLICY "Active gigs are viewable by everyone"
    ON gigs FOR SELECT USING (status = 'active' OR poster_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create gigs" ON gigs;
CREATE POLICY "Authenticated users can create gigs"
    ON gigs FOR INSERT WITH CHECK (auth.uid() = poster_id);

DROP POLICY IF EXISTS "Gig owners can update their gigs" ON gigs;
CREATE POLICY "Gig owners can update their gigs"
    ON gigs FOR UPDATE USING (auth.uid() = poster_id);

DROP POLICY IF EXISTS "Gig owners can delete their gigs" ON gigs;
CREATE POLICY "Gig owners can delete their gigs"
    ON gigs FOR DELETE USING (auth.uid() = poster_id);

-- Applications
DROP POLICY IF EXISTS "Applicants can view their own applications" ON applications;
CREATE POLICY "Applicants can view their own applications"
    ON applications FOR SELECT
    USING (auth.uid() = applicant_id OR auth.uid() IN (SELECT poster_id FROM gigs WHERE id = applications.gig_id));

DROP POLICY IF EXISTS "Users can apply to gigs" ON applications;
CREATE POLICY "Users can apply to gigs"
    ON applications FOR INSERT
    WITH CHECK (auth.uid() = applicant_id AND auth.uid() NOT IN (SELECT poster_id FROM gigs WHERE id = gig_id));

DROP POLICY IF EXISTS "Applicants can update their applications" ON applications;
CREATE POLICY "Applicants can update their applications"
    ON applications FOR UPDATE USING (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "Gig owners can update application status" ON applications;
CREATE POLICY "Gig owners can update application status"
    ON applications FOR UPDATE
    USING (auth.uid() IN (SELECT poster_id FROM gigs WHERE id = applications.gig_id));

-- Subscriptions
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
    ON subscriptions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;
CREATE POLICY "Users can update own subscription"
    ON subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Conversations
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
CREATE POLICY "Users can view their conversations"
    ON conversations FOR SELECT USING (auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
CREATE POLICY "Users can create conversations"
    ON conversations FOR INSERT WITH CHECK (auth.uid() = ANY(participant_ids));

-- Messages
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
CREATE POLICY "Users can view messages in their conversations"
    ON messages FOR SELECT
    USING (auth.uid() IN (SELECT unnest(participant_ids) FROM conversations WHERE id = conversation_id));

DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages"
    ON messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id AND auth.uid() IN (SELECT unnest(participant_ids) FROM conversations WHERE id = conversation_id));

DROP POLICY IF EXISTS "Users can update messages they can view" ON messages;
CREATE POLICY "Users can update messages they can view"
    ON messages FOR UPDATE
    USING (auth.uid() IN (SELECT unnest(participant_ids) FROM conversations WHERE id = conversation_id));

-- Reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews"
    ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create reviews" ON reviews;
CREATE POLICY "Users can create reviews"
    ON reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Users can update own reviews" ON reviews;
CREATE POLICY "Users can update own reviews"
    ON reviews FOR UPDATE USING (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "Users can delete own reviews" ON reviews;
CREATE POLICY "Users can delete own reviews"
    ON reviews FOR DELETE USING (auth.uid() = reviewer_id);

-- Notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications"
    ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE USING (auth.uid() = user_id);

-- Video calls
DROP POLICY IF EXISTS "Users can view their video calls" ON video_calls;
CREATE POLICY "Users can view their video calls"
    ON video_calls FOR SELECT USING (auth.uid() = initiator_id OR auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS "Users can create video calls" ON video_calls;
CREATE POLICY "Users can create video calls"
    ON video_calls FOR INSERT WITH CHECK (auth.uid() = initiator_id);

DROP POLICY IF EXISTS "Initiators can update video calls" ON video_calls;
CREATE POLICY "Initiators can update video calls"
    ON video_calls FOR UPDATE USING (auth.uid() = initiator_id OR auth.uid() = ANY(participant_ids));

-- Saved gigs
DROP POLICY IF EXISTS "Users can view own saved gigs" ON saved_gigs;
CREATE POLICY "Users can view own saved gigs"
    ON saved_gigs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save gigs" ON saved_gigs;
CREATE POLICY "Users can save gigs"
    ON saved_gigs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave gigs" ON saved_gigs;
CREATE POLICY "Users can unsave gigs"
    ON saved_gigs FOR DELETE USING (auth.uid() = user_id);

-- Work history
DROP POLICY IF EXISTS "Users can view any work history" ON work_history;
CREATE POLICY "Users can view any work history"
    ON work_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own work history" ON work_history;
CREATE POLICY "Users can manage own work history"
    ON work_history FOR ALL USING (auth.uid() = user_id);

-- Payments
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments"
    ON payments FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own payments" ON payments;
CREATE POLICY "Users can create own payments"
    ON payments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Gig usage
DROP POLICY IF EXISTS "Users can view own usage" ON gig_usage;
CREATE POLICY "Users can view own usage"
    ON gig_usage FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can manage usage" ON gig_usage;
CREATE POLICY "System can manage usage"
    ON gig_usage FOR ALL USING (true);
