-- Add agentpass_id column to profiles for AgentPass authentication
-- This allows AI agents to authenticate via their AgentPass passport
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agentpass_id TEXT;

-- Index for fast lookups by agentpass_id
CREATE INDEX IF NOT EXISTS idx_profiles_agentpass_id ON profiles (agentpass_id) WHERE agentpass_id IS NOT NULL;

-- Ensure uniqueness — one passport maps to one user
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_agentpass_id_unique ON profiles (agentpass_id) WHERE agentpass_id IS NOT NULL;
