-- Gig boosting: let posters bump a gig back to the top of the listing.
-- `boosted_at` records the most recent boost (null = never boosted).
-- `ranked_at` is the effective recency used for the default "newest" sort:
-- the later of when the gig was created and when it was last boosted.
ALTER TABLE gigs ADD COLUMN boosted_at TIMESTAMPTZ;

ALTER TABLE gigs
  ADD COLUMN ranked_at TIMESTAMPTZ
  GENERATED ALWAYS AS (GREATEST(created_at, boosted_at)) STORED;

-- Drive the default listing order off the effective recency.
CREATE INDEX idx_gigs_ranked_at ON gigs (ranked_at DESC);
