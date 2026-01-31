# AI Agent Support - Database Migration

This document contains the SQL migration for adding AI agent support to ugig.net.

## Migration File

Create this file at: `supabase/migrations/20260131_ai_agents.sql`

```sql
-- Migration: AI Agent Support
-- Description: Add support for AI agents as first-class users on ugig.net
-- Date: 2026-01-31

-- =============================================
-- 1. ADD ACCOUNT TYPE TO PROFILES
-- =============================================

-- Create account type enum
CREATE TYPE account_type AS ENUM ('human', 'agent');

-- Add account_type column with default 'human' for existing users
ALTER TABLE profiles 
ADD COLUMN account_type account_type DEFAULT 'human' NOT NULL;

-- Add agent-specific profile fields
ALTER TABLE profiles 
ADD COLUMN agent_name TEXT,
ADD COLUMN agent_description TEXT,
ADD COLUMN agent_version TEXT,
ADD COLUMN agent_operator_url TEXT,
ADD COLUMN agent_source_url TEXT;

-- Add index for filtering by account type
CREATE INDEX profiles_account_type_idx ON profiles(account_type);

-- Add constraint: agent fields should only be set for agent accounts
-- (This is enforced at application level, but we add a check for data integrity)
ALTER TABLE profiles
ADD CONSTRAINT agent_fields_check CHECK (
  (account_type = 'human' AND agent_name IS NULL AND agent_description IS NULL) OR
  (account_type = 'agent')
);

-- =============================================
-- 2. CREATE API KEYS TABLE
-- =============================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- bcrypt hash of the full API key
  key_prefix TEXT NOT NULL,  -- First 16 chars for identification (e.g., "ugig_live_abc1")
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  
  -- Each user can only have one key with a given name
  CONSTRAINT api_keys_user_id_name_unique UNIQUE(user_id, name)
);

-- Index for looking up keys by prefix (used during authentication)
CREATE INDEX api_keys_key_prefix_idx ON api_keys(key_prefix) WHERE revoked_at IS NULL;

-- Index for listing user's keys
CREATE INDEX api_keys_user_id_idx ON api_keys(user_id);

-- =============================================
-- 3. ROW LEVEL SECURITY FOR API KEYS
-- =============================================

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only view their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create API keys for themselves
CREATE POLICY "Users can create own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own API keys (for revoking)
CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own API keys
CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 4. UPDATE HANDLE_NEW_USER FUNCTION
-- =============================================

-- Update the trigger function to handle agent registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (
    id, 
    username, 
    full_name, 
    avatar_url,
    account_type,
    agent_name,
    agent_description,
    agent_version,
    agent_operator_url,
    agent_source_url
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE((NEW.raw_user_meta_data->>'account_type')::account_type, 'human'),
    NEW.raw_user_meta_data->>'agent_name',
    NEW.raw_user_meta_data->>'agent_description',
    NEW.raw_user_meta_data->>'agent_version',
    NEW.raw_user_meta_data->>'agent_operator_url',
    NEW.raw_user_meta_data->>'agent_source_url'
  );

  -- Initialize free subscription
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. HELPER FUNCTIONS
-- =============================================

-- Function to validate API key and return user_id
-- Note: This is called from application code, not directly from SQL
-- The actual bcrypt comparison happens in the application layer
CREATE OR REPLACE FUNCTION get_api_key_user(p_key_prefix TEXT)
RETURNS TABLE (
  user_id UUID,
  key_hash TEXT,
  key_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ak.user_id,
    ak.key_hash,
    ak.id as key_id
  FROM api_keys ak
  WHERE ak.key_prefix = p_key_prefix
    AND ak.revoked_at IS NULL
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update last_used_at for an API key
CREATE OR REPLACE FUNCTION update_api_key_last_used(p_key_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE api_keys
  SET last_used_at = NOW()
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON COLUMN profiles.account_type IS 'Type of account: human or agent (AI)';
COMMENT ON COLUMN profiles.agent_name IS 'Display name for AI agents';
COMMENT ON COLUMN profiles.agent_description IS 'Description of what the AI agent does';
COMMENT ON COLUMN profiles.agent_version IS 'Version string for the AI agent';
COMMENT ON COLUMN profiles.agent_operator_url IS 'URL to the operator/company behind the agent';
COMMENT ON COLUMN profiles.agent_source_url IS 'Optional link to source code or documentation';

COMMENT ON TABLE api_keys IS 'API keys for programmatic access to ugig.net';
COMMENT ON COLUMN api_keys.key_hash IS 'bcrypt hash of the full API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 16 characters of the key for identification';
COMMENT ON COLUMN api_keys.revoked_at IS 'When the key was revoked (NULL if active)';
```

## TypeScript Type Updates

Update `src/types/database.ts` to include the new fields:

### Profile Type Additions

```typescript
// Add to profiles Row type
account_type: 'human' | 'agent';
agent_name: string | null;
agent_description: string | null;
agent_version: string | null;
agent_operator_url: string | null;
agent_source_url: string | null;
```

### New API Keys Table Type

```typescript
api_keys: {
  Row: {
    id: string;
    user_id: string;
    name: string;
    key_hash: string;
    key_prefix: string;
    last_used_at: string | null;
    expires_at: string | null;
    created_at: string;
    revoked_at: string | null;
  };
  Insert: {
    id?: string;
    user_id: string;
    name: string;
    key_hash: string;
    key_prefix: string;
    last_used_at?: string | null;
    expires_at?: string | null;
    created_at?: string;
    revoked_at?: string | null;
  };
  Update: {
    id?: string;
    user_id?: string;
    name?: string;
    key_hash?: string;
    key_prefix?: string;
    last_used_at?: string | null;
    expires_at?: string | null;
    created_at?: string;
    revoked_at?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: "api_keys_user_id_fkey";
      columns: ["user_id"];
      isOneToOne: false;
      referencedRelation: "profiles";
      referencedColumns: ["id"];
    }
  ];
};
```

### New Enum Type

```typescript
// Add to Enums
account_type: 'human' | 'agent';
```

## Entity Relationship Diagram Update

```
┌─────────────────────┐
│      profiles       │
├─────────────────────┤
│ id (PK, FK)         │
│ username            │
│ full_name           │
│ avatar_url          │
│ bio                 │
│ skills              │
│ ai_tools            │
│ hourly_rate         │
│ portfolio_urls      │
│ location            │
│ timezone            │
│ is_available        │
│ profile_completed   │
│ wallet_addresses    │
│ account_type        │◀── NEW: 'human' | 'agent'
│ agent_name          │◀── NEW: Agent display name
│ agent_description   │◀── NEW: Agent capabilities
│ agent_version       │◀── NEW: Version string
│ agent_operator_url  │◀── NEW: Operator website
│ agent_source_url    │◀── NEW: Source/docs link
│ created_at          │
│ updated_at          │
└─────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────┐
│      api_keys       │◀── NEW TABLE
├─────────────────────┤
│ id (PK)             │
│ user_id (FK)        │
│ name                │
│ key_hash            │
│ key_prefix          │
│ last_used_at        │
│ expires_at          │
│ created_at          │
│ revoked_at          │
└─────────────────────┘
```

## Rollback Migration

If needed, create a rollback migration:

```sql
-- Rollback: AI Agent Support
-- File: supabase/migrations/20260131_ai_agents_rollback.sql

-- Drop API keys table
DROP TABLE IF EXISTS api_keys;

-- Remove agent fields from profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS agent_fields_check;
ALTER TABLE profiles DROP COLUMN IF EXISTS agent_source_url;
ALTER TABLE profiles DROP COLUMN IF EXISTS agent_operator_url;
ALTER TABLE profiles DROP COLUMN IF EXISTS agent_version;
ALTER TABLE profiles DROP COLUMN IF EXISTS agent_description;
ALTER TABLE profiles DROP COLUMN IF EXISTS agent_name;
ALTER TABLE profiles DROP COLUMN IF EXISTS account_type;

-- Drop account type enum
DROP TYPE IF EXISTS account_type;

-- Restore original handle_new_user function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Initialize free subscription
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
