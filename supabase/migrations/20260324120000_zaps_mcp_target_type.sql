-- Add 'mcp' to zaps target_type CHECK constraint
ALTER TABLE zaps DROP CONSTRAINT IF EXISTS zaps_target_type_check;
ALTER TABLE zaps ADD CONSTRAINT zaps_target_type_check
  CHECK (target_type IN ('post', 'gig', 'comment', 'skill', 'profile', 'mcp'));
