-- Auto-approve all pending testimonials that are tied to a gig
-- (including gig+profile worker reviews shown on profile pages)
UPDATE testimonials
SET status = 'approved'
WHERE gig_id IS NOT NULL
  AND status = 'pending';
