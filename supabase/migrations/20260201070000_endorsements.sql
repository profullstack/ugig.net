-- Skill Endorsements table
CREATE TABLE IF NOT EXISTS endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endorsed_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endorser_id, endorsed_id, skill),
  CHECK(endorser_id != endorsed_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS endorsements_endorsed_id_idx ON endorsements(endorsed_id);
CREATE INDEX IF NOT EXISTS endorsements_endorser_id_idx ON endorsements(endorser_id);
CREATE INDEX IF NOT EXISTS endorsements_skill_idx ON endorsements(skill);
CREATE INDEX IF NOT EXISTS endorsements_endorsed_skill_idx ON endorsements(endorsed_id, skill);

-- RLS Policies
ALTER TABLE endorsements ENABLE ROW LEVEL SECURITY;

-- Anyone can view endorsements (they're public social proof)
CREATE POLICY "Endorsements are publicly viewable"
  ON endorsements FOR SELECT USING (true);

-- Authenticated users can create endorsements (but not for themselves — CHECK constraint)
CREATE POLICY "Users can create endorsements"
  ON endorsements FOR INSERT
  WITH CHECK (auth.uid() = endorser_id);

-- Users can only delete their own endorsements
CREATE POLICY "Users can delete own endorsements"
  ON endorsements FOR DELETE
  USING (auth.uid() = endorser_id);

-- Add endorsement_received to notification_type enum if not exists
DO $$
BEGIN
  ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'endorsement_received';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
