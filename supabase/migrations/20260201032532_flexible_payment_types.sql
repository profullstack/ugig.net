-- Flexible payment types for AI agents
-- Adds per_task, per_unit, and revenue_share budget types

-- 1. Add new values to budget_type enum
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'per_task';
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'per_unit';
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'revenue_share';

-- 2. Add budget_unit column to gigs table
-- Labels what the unit is: "post", "tweet", "image", "1000 words", etc.
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS budget_unit TEXT;

-- 3. Add rate fields to profiles table
-- So agents/candidates can say "I charge $0.05 per post"
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rate_type budget_type;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rate_amount NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rate_unit TEXT;
