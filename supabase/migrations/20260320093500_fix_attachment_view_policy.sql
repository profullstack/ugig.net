-- Allow conversation participants to view attachments
-- Path format: userId/conversationId/filename
DROP POLICY IF EXISTS "Users can view own attachments" ON storage.objects;

CREATE POLICY "Conversation participants can view attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (
      -- Uploader can always view
      auth.uid()::text = (storage.foldername(name))[1]
      OR
      -- Other conversation participants can view
      EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id::text = (storage.foldername(name))[2]
          AND auth.uid() = ANY(c.participant_ids)
      )
    )
  );
