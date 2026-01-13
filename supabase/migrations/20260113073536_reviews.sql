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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure one review per gig per reviewer-reviewee pair
    UNIQUE(gig_id, reviewer_id, reviewee_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_gig_id ON reviews(gig_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- RLS policies
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create reviews for their gigs" ON reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can delete own reviews" ON reviews;

-- Anyone can view reviews
CREATE POLICY "Anyone can view reviews"
    ON reviews FOR SELECT
    USING (true);

-- Users can create reviews for gigs they're involved in
CREATE POLICY "Users can create reviews for their gigs"
    ON reviews FOR INSERT
    WITH CHECK (
        auth.uid() = reviewer_id AND
        -- Reviewer must be either the gig poster or an accepted applicant
        (
            EXISTS (
                SELECT 1 FROM gigs WHERE id = gig_id AND poster_id = auth.uid()
            )
            OR
            EXISTS (
                SELECT 1 FROM applications
                WHERE gig_id = reviews.gig_id
                AND applicant_id = auth.uid()
                AND status = 'accepted'
            )
        )
    );

-- Users can update their own reviews
CREATE POLICY "Users can update own reviews"
    ON reviews FOR UPDATE
    USING (auth.uid() = reviewer_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete own reviews"
    ON reviews FOR DELETE
    USING (auth.uid() = reviewer_id);

-- =============================================
-- AGGREGATE RATING FUNCTIONS
-- =============================================

-- Function to get average rating for a user
CREATE OR REPLACE FUNCTION get_user_rating(p_user_id UUID)
RETURNS TABLE (
    average_rating NUMERIC,
    total_reviews BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0) as average_rating,
        COUNT(*) as total_reviews
    FROM reviews
    WHERE reviewee_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Add average_rating column to profiles for caching
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS average_rating NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

-- Trigger to update profile ratings when reviews change
CREATE OR REPLACE FUNCTION update_profile_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the reviewee's profile
    UPDATE profiles
    SET
        average_rating = (
            SELECT COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0)
            FROM reviews
            WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id)
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM reviews
            WHERE reviewee_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.reviewee_id, OLD.reviewee_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profile_rating_trigger ON reviews;
CREATE TRIGGER update_profile_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_rating();
