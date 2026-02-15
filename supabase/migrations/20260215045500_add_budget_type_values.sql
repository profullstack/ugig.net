-- Add missing budget_type enum values
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'daily';
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'weekly';
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'monthly';
