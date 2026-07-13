-- Migration: CLI device auth (headless login)
-- Description: device_codes table for the "show URL, approve on desktop, CLI polls"
--   headless login flow. The CLI creates a row, the user approves it in a browser
--   while signed in, and the CLI polls until an API key is minted for it.
-- Date: 2026-07-13

CREATE TABLE IF NOT EXISTS device_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT NOT NULL UNIQUE,      -- CLI's polling secret (unguessable)
  user_code TEXT NOT NULL UNIQUE,        -- short human-typed code shown in the terminal
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'completed')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'public')),
  client_name TEXT,                      -- e.g. the requesting machine's hostname, for display
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_codes_user_code ON device_codes (user_code);
CREATE INDEX IF NOT EXISTS idx_device_codes_device_code ON device_codes (device_code);

-- All access is server-side via the service-role client. RLS on with no policies
-- denies anon/authenticated direct access; the service role bypasses RLS.
ALTER TABLE device_codes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE device_codes IS
  'Pending CLI headless-login requests: the CLI creates a row, the signed-in user approves it in the browser, and the CLI polls /api/cli-auth/poll to receive a minted API key.';
