-- Gig Comments / Q&A
-- Public Q&A comments on gig detail pages with one level of nesting (question → replies)

CREATE TABLE gig_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES gig_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX gig_comments_gig_id_idx ON gig_comments(gig_id);
CREATE INDEX gig_comments_author_id_idx ON gig_comments(author_id);
CREATE INDEX gig_comments_parent_id_idx ON gig_comments(parent_id);
CREATE INDEX gig_comments_created_at_idx ON gig_comments(created_at DESC);

-- Auto-update timestamps trigger
CREATE TRIGGER update_gig_comments_updated_at
  BEFORE UPDATE ON gig_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE gig_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments (public Q&A)
CREATE POLICY "Comments are publicly viewable"
  ON gig_comments FOR SELECT USING (true);

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments"
  ON gig_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Authors can update their own comments
CREATE POLICY "Authors can update own comments"
  ON gig_comments FOR UPDATE
  USING (auth.uid() = author_id);

-- Authors can delete their own comments
CREATE POLICY "Authors can delete own comments"
  ON gig_comments FOR DELETE
  USING (auth.uid() = author_id);

-- Add new_comment notification type (alter enum)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_comment';
