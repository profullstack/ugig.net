-- Add 'yearly' to budget_type enum
ALTER TYPE budget_type ADD VALUE IF NOT EXISTS 'yearly';
