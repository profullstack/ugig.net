-- Polls on feed posts
CREATE TABLE IF NOT EXISTS poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  text text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id) -- one vote per user per poll
);

CREATE INDEX idx_poll_options_post ON poll_options(post_id);
CREATE INDEX idx_poll_votes_post ON poll_votes(post_id);
CREATE INDEX idx_poll_votes_option ON poll_votes(option_id);

-- RLS
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view poll options" ON poll_options FOR SELECT USING (true);
CREATE POLICY "Authors can create poll options" ON poll_options FOR INSERT WITH CHECK (
  post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
);

CREATE POLICY "Anyone can view poll votes" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can vote" ON poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own votes" ON poll_votes FOR DELETE USING (auth.uid() = user_id);

-- Add post_type 'poll' support (post_type is text, no enum constraint)
COMMENT ON COLUMN posts.post_type IS 'Valid values: text, link, poll';
