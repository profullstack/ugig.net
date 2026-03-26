-- MCP Security Scans: SpiderShield + mcp-scan results
-- =============================================

CREATE TABLE mcp_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES mcp_listings(id) ON DELETE CASCADE,
  scanner_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rating TEXT,                    -- F, D, C, B, A, A+
  security_score NUMERIC(4,1),
  findings JSONB DEFAULT '[]',
  spidershield_report JSONB,
  mcp_scan_report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_security_scans_listing ON mcp_security_scans(listing_id);
CREATE INDEX idx_mcp_security_scans_created ON mcp_security_scans(created_at DESC);

ALTER TABLE mcp_security_scans ENABLE ROW LEVEL SECURITY;

-- Anyone can read scan results for listings they can see
CREATE POLICY "mcp_security_scans_select"
  ON mcp_security_scans FOR SELECT
  USING (true);

-- Only the listing owner can insert scans (via service role in practice)
CREATE POLICY "mcp_security_scans_insert"
  ON mcp_security_scans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM mcp_listings
      WHERE mcp_listings.id = listing_id
        AND mcp_listings.seller_id = auth.uid()
    )
  );

-- Add scan columns to mcp_listings if not present
ALTER TABLE mcp_listings ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'unscanned';
ALTER TABLE mcp_listings ADD COLUMN IF NOT EXISTS scan_rating TEXT;
