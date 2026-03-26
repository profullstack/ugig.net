-- Add 'new_review' to notification_type enum
-- The notify_on_new_review trigger uses this value but it was never added to the enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_review';
