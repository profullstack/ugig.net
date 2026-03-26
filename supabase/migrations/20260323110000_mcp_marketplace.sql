-- MCP Server Marketplace: listings, purchases, reviews
-- =============================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE mcp_listing_status AS ENUM ('draft', 'active', 'archived');

-- Add MCP-related notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mcp_purchased';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mcp_review';

-- =============================================
-- MCP LISTINGS TABLE
-- =============================================

CREATE TABLE mcp_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT NOT NULL DEFAULT '',
  price_sats BIGINT NOT NULL DEFAULT 0 CHECK (price_sats >= 0),
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  mcp_server_url TEXT,                  -- the MCP server endpoint URL
  source_url TEXT,                      -- GitHub/source code URL
  transport_type TEXT,                  -- 'stdio', 'sse', 'streamable-http'
  supported_tools TEXT[] DEFAULT '{}',  -- list of tools the server provides
  status mcp_listing_status NOT NULL DEFAULT 'draft',
  downloads_count INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mcp_listings_slug_unique UNIQUE (slug)
);

-- Indexes
CREATE INDEX idx_mcp_listings_seller ON mcp_listings(seller_id);
CREATE INDEX idx_mcp_listings_status ON mcp_listings(status);
CREATE INDEX idx_mcp_listings_category ON mcp_listings(category);
CREATE INDEX idx_mcp_listings_created ON mcp_listings(created_at DESC);
CREATE INDEX idx_mcp_listings_tags ON mcp_listings USING GIN(tags);
CREATE INDEX idx_mcp_listings_search ON mcp_listings
  USING GIN (to_tsvector('english', title || ' ' || coalesce(tagline, '') || ' ' || description));

-- =============================================
-- MCP PURCHASES TABLE
-- =============================================

CREATE TABLE mcp_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES mcp_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price_sats BIGINT NOT NULL,
  fee_sats BIGINT NOT NULL DEFAULT 0,
  fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mcp_purchases_unique UNIQUE (listing_id, buyer_id)
);

-- Indexes
CREATE INDEX idx_mcp_purchases_buyer ON mcp_purchases(buyer_id);
CREATE INDEX idx_mcp_purchases_seller ON mcp_purchases(seller_id);
CREATE INDEX idx_mcp_purchases_listing ON mcp_purchases(listing_id);

-- =============================================
-- MCP REVIEWS TABLE
-- =============================================

CREATE TABLE mcp_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES mcp_listings(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES mcp_purchases(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mcp_reviews_unique UNIQUE (listing_id, reviewer_id)
);

-- Indexes
CREATE INDEX idx_mcp_reviews_listing ON mcp_reviews(listing_id);
CREATE INDEX idx_mcp_reviews_reviewer ON mcp_reviews(reviewer_id);

-- =============================================
-- MCP VOTES TABLE
-- =============================================

CREATE TABLE mcp_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES mcp_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INTEGER NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mcp_votes_unique UNIQUE (listing_id, user_id)
);

CREATE INDEX idx_mcp_votes_listing ON mcp_votes(listing_id);
CREATE INDEX idx_mcp_votes_user ON mcp_votes(user_id);

-- =============================================
-- MCP COMMENTS TABLE
-- =============================================

CREATE TABLE mcp_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES mcp_listings(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES mcp_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_comments_listing ON mcp_comments(listing_id);
CREATE INDEX idx_mcp_comments_author ON mcp_comments(author_id);
CREATE INDEX idx_mcp_comments_parent ON mcp_comments(parent_id);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE mcp_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_comments ENABLE ROW LEVEL SECURITY;

-- mcp_listings: anyone can read active, sellers CRUD own
CREATE POLICY "Active mcp listings are public"
  ON mcp_listings FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid());

CREATE POLICY "Sellers can insert own mcp listings"
  ON mcp_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own mcp listings"
  ON mcp_listings FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own mcp listings"
  ON mcp_listings FOR DELETE
  USING (auth.uid() = seller_id);

-- mcp_purchases: buyers see own, sellers see own sales
CREATE POLICY "Buyers can view own mcp purchases"
  ON mcp_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers can view own mcp sales"
  ON mcp_purchases FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Service role can insert mcp purchases"
  ON mcp_purchases FOR INSERT
  WITH CHECK (true);

-- mcp_reviews: public read, buyers can write
CREATE POLICY "MCP reviews are publicly viewable"
  ON mcp_reviews FOR SELECT
  USING (true);

CREATE POLICY "Buyers can create mcp reviews"
  ON mcp_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Reviewers can update own mcp reviews"
  ON mcp_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

-- mcp_votes: public read, users can manage own
CREATE POLICY "MCP votes are publicly viewable"
  ON mcp_votes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own mcp votes"
  ON mcp_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own mcp votes"
  ON mcp_votes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own mcp votes"
  ON mcp_votes FOR DELETE
  USING (auth.uid() = user_id);

-- mcp_comments: public read, authenticated write
CREATE POLICY "MCP comments are publicly viewable"
  ON mcp_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own mcp comments"
  ON mcp_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own mcp comments"
  ON mcp_comments FOR UPDATE
  USING (auth.uid() = author_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update timestamps
CREATE TRIGGER update_mcp_listings_updated_at
  BEFORE UPDATE ON mcp_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_mcp_reviews_updated_at
  BEFORE UPDATE ON mcp_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_mcp_comments_updated_at
  BEFORE UPDATE ON mcp_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update listing rating aggregates on review insert/update/delete
CREATE OR REPLACE FUNCTION update_mcp_listing_rating()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE mcp_listings SET
    rating_avg = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM mcp_reviews WHERE listing_id = _listing_id), 0),
    rating_count = (SELECT COUNT(*) FROM mcp_reviews WHERE listing_id = _listing_id)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_mcp_review_change
  AFTER INSERT OR UPDATE OR DELETE ON mcp_reviews
  FOR EACH ROW EXECUTE FUNCTION update_mcp_listing_rating();

-- Increment downloads_count on purchase
CREATE OR REPLACE FUNCTION increment_mcp_downloads()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE mcp_listings SET downloads_count = downloads_count + 1 WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_mcp_purchase_created
  AFTER INSERT ON mcp_purchases
  FOR EACH ROW EXECUTE FUNCTION increment_mcp_downloads();

-- Update vote counts on mcp_votes changes
CREATE OR REPLACE FUNCTION update_mcp_listing_votes()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
  _up INTEGER;
  _down INTEGER;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  SELECT
    COALESCE(SUM(CASE WHEN vote_type = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vote_type = -1 THEN 1 ELSE 0 END), 0)
  INTO _up, _down
  FROM mcp_votes WHERE listing_id = _listing_id;

  UPDATE mcp_listings SET
    upvotes = _up,
    downvotes = _down,
    score = _up - _down
  WHERE id = _listing_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_mcp_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON mcp_votes
  FOR EACH ROW EXECUTE FUNCTION update_mcp_listing_votes();

-- =============================================
-- WALLET TRANSACTION TYPE EXTENSION
-- =============================================
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'deposit', 'withdrawal', 'zap_sent', 'zap_received', 'zap_fee', 'withdrawal_fee',
    'skill_purchase', 'skill_sale', 'skill_sale_fee',
    'mcp_purchase', 'mcp_sale', 'mcp_sale_fee'
  ));
