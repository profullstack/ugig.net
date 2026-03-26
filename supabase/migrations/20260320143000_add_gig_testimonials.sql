-- Add gig_id column to testimonials (nullable - null means it's a profile testimonial)
ALTER TABLE testimonials ADD COLUMN gig_id UUID REFERENCES gigs(id) ON DELETE CASCADE;

-- Make profile_id nullable (gig testimonials won't have a profile_id)
ALTER TABLE testimonials ALTER COLUMN profile_id DROP NOT NULL;

-- Add check: exactly one of profile_id or gig_id must be set
ALTER TABLE testimonials ADD CONSTRAINT testimonials_target_check
  CHECK (
    (profile_id IS NOT NULL AND gig_id IS NULL) OR
    (profile_id IS NULL AND gig_id IS NOT NULL)
  );

-- Unique constraint: one testimonial per author per gig
CREATE UNIQUE INDEX idx_testimonials_author_gig ON testimonials(author_id, gig_id) WHERE gig_id IS NOT NULL;

-- Index for fetching gig testimonials
CREATE INDEX idx_testimonials_gig ON testimonials(gig_id, status) WHERE gig_id IS NOT NULL;

-- RLS: allow viewing approved gig testimonials, and gig poster can see all statuses
DROP POLICY IF EXISTS "Anyone can view approved testimonials" ON testimonials;
CREATE POLICY "Anyone can view approved testimonials" ON testimonials
  FOR SELECT USING (
    status = 'approved'
    OR auth.uid() = profile_id
    OR gig_id IN (SELECT id FROM gigs WHERE poster_id = auth.uid())
  );
