-- Append-only audit trail for external OAuth identity links (#537).
--
-- oauth_identities holds only the *current* link, and disconnecting deletes the
-- row, so without this there is no record that a CoinPay identity was ever
-- attached to a profile or when it was released. Payout routing depends on that
-- link, so the connect/disconnect history has to outlive the link itself.
--
-- Idempotent: applied via the Supabase MCP, whose recorded version does not
-- match this filename.

CREATE TABLE IF NOT EXISTS oauth_identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text,
  event text NOT NULL,
  email text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE oauth_identity_events
    DROP CONSTRAINT IF EXISTS oauth_identity_events_event_check;
  ALTER TABLE oauth_identity_events
    ADD CONSTRAINT oauth_identity_events_event_check
    CHECK (event IN ('connected', 'reconnected', 'disconnected', 'link_rejected'));
END $$;

CREATE INDEX IF NOT EXISTS idx_oauth_identity_events_user
  ON oauth_identity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_identity_events_provider
  ON oauth_identity_events(provider, provider_user_id);

ALTER TABLE oauth_identity_events ENABLE ROW LEVEL SECURITY;

-- Owners may read their own history. Writes come from the service role only,
-- which bypasses RLS, so there is deliberately no INSERT/UPDATE/DELETE policy:
-- an audit row must not be forgeable or erasable by the account it describes.
DROP POLICY IF EXISTS "Users can view their own oauth identity events" ON oauth_identity_events;
CREATE POLICY "Users can view their own oauth identity events"
  ON oauth_identity_events FOR SELECT
  USING (auth.uid() = user_id);
