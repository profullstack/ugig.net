-- Global broadcast messaging.
--
-- Today a gig poster can message every applicant on a single gig
-- (api/gigs/[id]/applications/message-all). This generalizes that to an
-- audience that spans gigs and bounties, plus an admin-only "everyone on the
-- platform" audience for collecting product feedback in-app instead of email.
--
-- Broadcasts reuse the existing group-conversation shape: one conversation
-- whose participant_ids holds the sender plus every recipient, so the thread
-- lands in the normal inbox and replies work with no new message plumbing.
-- The columns below mark such a thread so that:
--   1. repeat broadcasts to the same audience reuse one thread, looked up by
--      (owner, audience) instead of an O(n) participant_ids @> probe, and
--   2. the inbox can render it as a broadcast and skip hydrating every
--      participant profile.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_broadcast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS broadcast_audience text,
  ADD COLUMN IF NOT EXISTS broadcast_owner_id uuid
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_broadcast_owner
  ON conversations(broadcast_owner_id, broadcast_audience)
  WHERE is_broadcast;

COMMENT ON COLUMN conversations.is_broadcast IS
  'True when this thread was created by a one-to-many broadcast send.';
COMMENT ON COLUMN conversations.broadcast_audience IS
  'Audience key the broadcast targeted (gig_applicants, bounty_submitters, my_people, all_users).';
COMMENT ON COLUMN conversations.broadcast_owner_id IS
  'User who owns/sends this broadcast thread; paired with broadcast_audience for thread reuse.';
