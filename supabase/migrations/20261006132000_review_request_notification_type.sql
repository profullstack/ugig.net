-- In-app "Rate @username for <gig>" prompts (PRD 04, requirement 2).
--
-- Its own migration because a value added with ALTER TYPE ... ADD VALUE cannot
-- be used in the same transaction; 20261006132100_reviews_both_sides.sql uses
-- it. Additive and idempotent.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'review_request';
