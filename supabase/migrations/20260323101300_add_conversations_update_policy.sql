-- Add UPDATE policy on conversations so participants can update last_message_at and archived_at
-- Without this, the trigger update_conversation_last_message silently fails due to RLS,
-- causing inbox sorting to be stuck at conversation creation time.

-- Policy for participants to update their conversations
CREATE POLICY "Participants can update their conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = ANY(participant_ids))
  WITH CHECK (auth.uid() = ANY(participant_ids));

-- Also fix the trigger function to be SECURITY DEFINER so it always works
-- regardless of the calling user's RLS context
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.conversations SET last_message_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

-- Backfill: update last_message_at for all conversations based on their actual latest message
UPDATE conversations c
SET last_message_at = sub.latest
FROM (
  SELECT conversation_id, MAX(created_at) AS latest
  FROM messages
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND (c.last_message_at IS NULL OR c.last_message_at < sub.latest);
