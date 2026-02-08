-- 1. Add depth column to post_comments for nested threading (up to 5 levels)
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS depth INT DEFAULT 0;

-- Set depth for existing comments
UPDATE post_comments SET depth = 0 WHERE parent_id IS NULL;
UPDATE post_comments SET depth = 1 WHERE parent_id IS NOT NULL;

-- 2. Create a SECURITY DEFINER function to increment post views
-- This bypasses RLS since only post authors can update their own posts
CREATE OR REPLACE FUNCTION increment_post_views(post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts SET views_count = views_count + 1 WHERE id = post_id;
END;
$$;

-- 3. Comment votes table (mirrors post_votes pattern)
CREATE TABLE IF NOT EXISTS post_comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INT NOT NULL CHECK (vote_type IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_comment_votes_comment_id_idx ON post_comment_votes(comment_id);
CREATE INDEX IF NOT EXISTS post_comment_votes_user_id_idx ON post_comment_votes(user_id);

ALTER TABLE post_comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comment votes are publicly viewable"
  ON post_comment_votes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create comment votes"
  ON post_comment_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comment votes"
  ON post_comment_votes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comment votes"
  ON post_comment_votes FOR DELETE USING (auth.uid() = user_id);

-- Add score columns to post_comments
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS upvotes INT DEFAULT 0;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS downvotes INT DEFAULT 0;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS score INT DEFAULT 0;

-- Trigger to update comment vote counts
CREATE OR REPLACE FUNCTION update_comment_vote_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE post_comments SET
      upvotes = (SELECT COUNT(*) FROM post_comment_votes WHERE comment_id = NEW.comment_id AND vote_type = 1),
      downvotes = (SELECT COUNT(*) FROM post_comment_votes WHERE comment_id = NEW.comment_id AND vote_type = -1),
      score = (SELECT COALESCE(SUM(vote_type), 0) FROM post_comment_votes WHERE comment_id = NEW.comment_id)
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post_comments SET
      upvotes = (SELECT COUNT(*) FROM post_comment_votes WHERE comment_id = OLD.comment_id AND vote_type = 1),
      downvotes = (SELECT COUNT(*) FROM post_comment_votes WHERE comment_id = OLD.comment_id AND vote_type = -1),
      score = (SELECT COALESCE(SUM(vote_type), 0) FROM post_comment_votes WHERE comment_id = OLD.comment_id)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER post_comment_votes_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON post_comment_votes
  FOR EACH ROW EXECUTE FUNCTION update_comment_vote_counts();
