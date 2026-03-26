CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,  -- who the testimonial is FOR
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,   -- who wrote it
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, author_id)  -- one testimonial per author per profile
);
CREATE INDEX IF NOT EXISTS idx_testimonials_profile ON testimonials(profile_id, status);
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
-- Anyone can read approved testimonials, profile owner can see all statuses
DROP POLICY IF EXISTS "Anyone can view approved testimonials" ON testimonials;
DROP POLICY IF EXISTS "Anyone can view approved testimonials" ON testimonials;
CREATE POLICY "Anyone can view approved testimonials" ON testimonials FOR SELECT USING (status = 'approved' OR auth.uid() = profile_id);
-- Authenticated users can insert testimonials
DROP POLICY IF EXISTS "Authenticated users can write testimonials" ON testimonials;
DROP POLICY IF EXISTS "Authenticated users can write testimonials" ON testimonials;
CREATE POLICY "Authenticated users can write testimonials" ON testimonials FOR INSERT WITH CHECK (auth.uid() = author_id);
-- Profile owner can update status (approve/reject)
DROP POLICY IF EXISTS "Profile owner can manage testimonials" ON testimonials;
DROP POLICY IF EXISTS "Profile owner can manage testimonials" ON testimonials;
CREATE POLICY "Profile owner can manage testimonials" ON testimonials FOR UPDATE USING (auth.uid() = profile_id);
-- Author can delete their own
DROP POLICY IF EXISTS "Author can delete own testimonial" ON testimonials;
DROP POLICY IF EXISTS "Author can delete own testimonial" ON testimonials;
CREATE POLICY "Author can delete own testimonial" ON testimonials FOR DELETE USING (auth.uid() = author_id);
