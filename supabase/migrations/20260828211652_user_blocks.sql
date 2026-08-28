-- User blocking
-- A one-way record: blocker_id no longer wants any contact from blocked_id.
-- Enforcement is symmetric (neither side can message or follow the other) but
-- only the blocker can create or remove the row.

CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK(blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_id_idx ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx ON user_blocks(blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Only the blocker can see their own block list. The blocked user must not be
-- able to enumerate who blocked them, so there is deliberately no policy
-- granting SELECT on blocked_id — server code uses users_are_blocked() for the
-- symmetric check instead.
DROP POLICY IF EXISTS "Users can view their own blocks" ON user_blocks;
CREATE POLICY "Users can view their own blocks"
  ON user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can block others" ON user_blocks;
CREATE POLICY "Users can block others"
  ON user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock" ON user_blocks;
CREATE POLICY "Users can unblock"
  ON user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- Symmetric check: true when either user has blocked the other. SECURITY
-- DEFINER so a caller can learn "contact is not allowed" without being able to
-- read the row that says so.
CREATE OR REPLACE FUNCTION users_are_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION users_are_blocked(UUID, UUID) TO authenticated, anon, service_role;

-- Every id the given user must not see, in either direction. Used to filter
-- feeds and listings.
CREATE OR REPLACE FUNCTION blocked_user_ids(for_user UUID)
RETURNS TABLE (user_id UUID) AS $$
  SELECT blocked_id FROM user_blocks WHERE blocker_id = for_user
  UNION
  SELECT blocker_id FROM user_blocks WHERE blocked_id = for_user;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION blocked_user_ids(UUID) TO authenticated, service_role;

-- Blocking severs the social graph both ways: leaving a follow in place would
-- keep the blocked user's posts in the blocker's following feed.
CREATE OR REPLACE FUNCTION drop_follows_on_block()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM follows
  WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_user_block ON user_blocks;
CREATE TRIGGER on_user_block
  AFTER INSERT ON user_blocks
  FOR EACH ROW EXECUTE FUNCTION drop_follows_on_block();
