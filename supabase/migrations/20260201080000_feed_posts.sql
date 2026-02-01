-- Feed & Posts feature: posts + post_votes tables

-- Posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  url TEXT,
  post_type TEXT DEFAULT 'text',
  tags TEXT[] DEFAULT '{}',
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  score INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  views_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post votes table
CREATE TABLE post_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Indexes for posts
CREATE INDEX posts_author_id_idx ON posts(author_id);
CREATE INDEX posts_created_at_idx ON posts(created_at DESC);
CREATE INDEX posts_score_idx ON posts(score DESC);
CREATE INDEX posts_tags_idx ON posts USING GIN(tags);
CREATE INDEX posts_post_type_idx ON posts(post_type);

-- Indexes for post_votes
CREATE INDEX post_votes_post_id_idx ON post_votes(post_id);
CREATE INDEX post_votes_user_id_idx ON post_votes(user_id);

-- Auto-update timestamps trigger for posts
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies for posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT USING (true);

CREATE POLICY "Users can insert own posts"
  ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE USING (auth.uid() = author_id);

-- RLS Policies for post_votes
ALTER TABLE post_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are viewable by everyone"
  ON post_votes FOR SELECT USING (true);

CREATE POLICY "Users can insert own votes"
  ON post_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON post_votes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON post_votes FOR DELETE USING (auth.uid() = user_id);
