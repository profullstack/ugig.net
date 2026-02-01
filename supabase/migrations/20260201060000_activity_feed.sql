-- Activity Feed migration
-- Auto-generated activity stream for user profiles

-- Create activities table
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  metadata JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX activities_user_id_idx ON activities(user_id, created_at DESC);
CREATE INDEX activities_type_idx ON activities(activity_type);
CREATE INDEX activities_created_at_idx ON activities(created_at DESC);

-- RLS Policies
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Public activities are viewable by everyone
CREATE POLICY "Public activities are viewable by everyone"
  ON activities FOR SELECT
  USING (is_public = true);

-- Users can view their own private activities
CREATE POLICY "Users can view own activities"
  ON activities FOR SELECT
  USING (auth.uid() = user_id);

-- Only system can insert activities (via service role / triggers)
CREATE POLICY "Service role can insert activities"
  ON activities FOR INSERT
  WITH CHECK (true);

-- Trigger: auto-create activity when a gig is posted
CREATE OR REPLACE FUNCTION create_gig_posted_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_gig_posted
  AFTER INSERT ON gigs
  FOR EACH ROW EXECUTE FUNCTION create_gig_posted_activity();

-- Trigger: auto-create activity when gig is completed/filled
CREATE OR REPLACE FUNCTION create_gig_completed_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'filled' AND (OLD.status IS NULL OR OLD.status != 'filled') THEN
    INSERT INTO activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_gig_completed
  AFTER UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION create_gig_completed_activity();

-- Trigger: auto-create activity when user applies to a gig (private by default)
CREATE OR REPLACE FUNCTION create_gig_applied_activity()
RETURNS TRIGGER AS $$
DECLARE
  gig_title TEXT;
  gig_category TEXT;
BEGIN
  SELECT title, category INTO gig_title, gig_category FROM gigs WHERE id = NEW.gig_id;
  
  INSERT INTO activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_gig_applied
  AFTER INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION create_gig_applied_activity();

-- Trigger: auto-create activity when review is given
CREATE OR REPLACE FUNCTION create_review_activity()
RETURNS TRIGGER AS $$
DECLARE
  gig_title TEXT;
  reviewer_name TEXT;
  reviewee_name TEXT;
BEGIN
  SELECT title INTO gig_title FROM gigs WHERE id = NEW.gig_id;
  SELECT COALESCE(full_name, username) INTO reviewer_name FROM profiles WHERE id = NEW.reviewer_id;
  SELECT COALESCE(full_name, username) INTO reviewee_name FROM profiles WHERE id = NEW.reviewee_id;
  
  -- Activity for reviewer (gave a review)
  INSERT INTO activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
  VALUES (
    NEW.reviewer_id,
    'review_given',
    NEW.id,
    'review',
    jsonb_build_object('gig_title', gig_title, 'rating', NEW.rating, 'reviewee_name', reviewee_name, 'gig_id', NEW.gig_id),
    true
  );
  
  -- Activity for reviewee (received a review)
  INSERT INTO activities (user_id, activity_type, reference_id, reference_type, metadata, is_public)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_created
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION create_review_activity();
