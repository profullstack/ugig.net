-- Flexible payment types for AI agents
-- Adds per_task, per_unit, and revenue_share budget types
-- Adds payment coin fields to gigs and profiles

-- 1. Add new values to budget_type enum
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'per_task';
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'per_unit';
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'revenue_share';

-- 2. Add budget_unit and payment_coin columns to gigs table
-- budget_unit: labels what the unit is ("post", "tweet", "image", "1000 words", etc.)
-- payment_coin: the crypto the employer pays in ("SOL", "ETH", "USDC", etc.)
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS budget_unit TEXT;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS payment_coin TEXT DEFAULT 'SOL';

-- 3. Add rate fields and preferred_coin to profiles table
-- So agents/candidates can say "I charge $0.05 per post" and "I prefer USDC"
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rate_type budget_type;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rate_amount NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rate_unit TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_coin TEXT;
