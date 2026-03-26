-- Add archived_at column to conversations for auto-archiving inactive conversations
ALTER TABLE conversations ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering archived vs active conversations
CREATE INDEX idx_conversations_archived_at ON conversations (archived_at);
