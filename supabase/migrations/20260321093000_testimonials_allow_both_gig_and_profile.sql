-- Allow testimonials to reference BOTH a profile and a gig
-- (e.g. poster reviews worker FOR a specific gig)
ALTER TABLE testimonials DROP CONSTRAINT IF EXISTS testimonials_target_check;

-- New constraint: at least one of profile_id or gig_id must be set
ALTER TABLE testimonials ADD CONSTRAINT testimonials_target_check
  CHECK (profile_id IS NOT NULL OR gig_id IS NOT NULL);

-- Unique: one testimonial per author per profile per gig (allows both set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonials_author_profile_gig
  ON testimonials(author_id, profile_id, gig_id)
  WHERE profile_id IS NOT NULL AND gig_id IS NOT NULL;
