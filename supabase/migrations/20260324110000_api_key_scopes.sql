-- Migration: API Key Scopes
-- Description: Add scope column to api_keys for public/full access control
-- Date: 2026-03-24

-- Add scope column (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_keys' AND column_name = 'scope'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN scope TEXT NOT NULL DEFAULT 'full';
    COMMENT ON COLUMN api_keys.scope IS 'Access scope: full (unrestricted) or public (listing endpoints only)';
  END IF;
END $$;

-- Drop and recreate get_api_key_user to add scope to return type
-- (CREATE OR REPLACE can't change return type, so we must DROP first)
DROP FUNCTION IF EXISTS get_api_key_user(TEXT);

CREATE FUNCTION get_api_key_user(p_key_prefix TEXT)
RETURNS TABLE (
  user_id UUID,
  key_hash TEXT,
  key_id UUID,
  scope TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.user_id,
    ak.key_hash,
    ak.id as key_id,
    ak.scope
  FROM api_keys ak
  WHERE ak.key_prefix = p_key_prefix
    AND ak.revoked_at IS NULL
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
