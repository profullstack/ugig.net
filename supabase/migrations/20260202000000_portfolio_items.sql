-- Portfolio Items table
-- Allows users to showcase completed projects, demos, and work samples

CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,          -- link to live project
  image_url TEXT,    -- screenshot / preview image
  tags TEXT[] DEFAULT '{}',
  gig_id UUID REFERENCES gigs(id) ON DELETE SET NULL, -- optional link to completed gig
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_portfolio_items_user_id ON portfolio_items(user_id);
CREATE INDEX idx_portfolio_items_gig_id ON portfolio_items(gig_id) WHERE gig_id IS NOT NULL;
CREATE INDEX idx_portfolio_items_created_at ON portfolio_items(created_at DESC);

-- RLS
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read portfolio items
CREATE POLICY "portfolio_items_select_all"
  ON portfolio_items FOR SELECT
  USING (true);

-- Only owner can insert
CREATE POLICY "portfolio_items_insert_own"
  ON portfolio_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only owner can update
CREATE POLICY "portfolio_items_update_own"
  ON portfolio_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only owner can delete
CREATE POLICY "portfolio_items_delete_own"
  ON portfolio_items FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_portfolio_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_portfolio_items_updated_at
  BEFORE UPDATE ON portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION update_portfolio_items_updated_at();
