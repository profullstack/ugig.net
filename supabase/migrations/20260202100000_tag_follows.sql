-- Tag Follows Migration
-- Allow users to follow tags and filter their feed

-- 1. Create tag_follows table
CREATE TABLE IF NOT EXISTS tag_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tag)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS tag_follows_user_id_idx ON tag_follows(user_id);
CREATE INDEX IF NOT EXISTS tag_follows_tag_idx ON tag_follows(tag);

-- 2. RLS policies
ALTER TABLE tag_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can view tag follows (public)
CREATE POLICY "Tag follows are viewable by everyone"
  ON tag_follows FOR SELECT USING (true);

-- Authenticated users can follow tags
CREATE POLICY "Authenticated users can follow tags"
  ON tag_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can unfollow tags (delete their own)
CREATE POLICY "Users can unfollow tags"
  ON tag_follows FOR DELETE
  USING (auth.uid() = user_id);
