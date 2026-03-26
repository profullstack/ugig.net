-- Auto-approve all existing pending gig-only testimonials
-- (gig testimonials should not require candidate approval)
UPDATE testimonials
SET status = 'approved'
WHERE gig_id IS NOT NULL
  AND profile_id IS NULL
  AND status = 'pending';
