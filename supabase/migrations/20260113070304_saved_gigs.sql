-- =============================================
-- SAVED GIGS TABLE (Bookmarking)
-- =============================================

CREATE TABLE IF NOT EXISTS saved_gigs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, gig_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_saved_gigs_user_id ON saved_gigs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_gigs_gig_id ON saved_gigs(gig_id);

-- RLS policies
ALTER TABLE saved_gigs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own saved gigs" ON saved_gigs;
DROP POLICY IF EXISTS "Users can save gigs" ON saved_gigs;
DROP POLICY IF EXISTS "Users can unsave gigs" ON saved_gigs;

-- Users can view their own saved gigs
CREATE POLICY "Users can view own saved gigs"
    ON saved_gigs FOR SELECT
    USING (auth.uid() = user_id);

-- Users can save gigs
CREATE POLICY "Users can save gigs"
    ON saved_gigs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can unsave gigs
CREATE POLICY "Users can unsave gigs"
    ON saved_gigs FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================
-- UPDATE GIG USAGE FUNCTION
-- Only count active posts against the limit
-- =============================================

CREATE OR REPLACE FUNCTION increment_gig_usage_for_active(
    p_user_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO gig_usage (user_id, month, year, posts_count)
    VALUES (p_user_id, p_month, p_year, 1)
    ON CONFLICT (user_id, month, year)
    DO UPDATE SET posts_count = gig_usage.posts_count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement usage when gig is closed/deleted
CREATE OR REPLACE FUNCTION decrement_gig_usage(
    p_user_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE gig_usage
    SET posts_count = GREATEST(posts_count - 1, 0)
    WHERE user_id = p_user_id
      AND month = p_month
      AND year = p_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
