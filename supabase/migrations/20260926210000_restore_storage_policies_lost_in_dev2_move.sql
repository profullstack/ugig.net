-- Restore the RLS policies on storage.objects that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a policy
-- under its table's schema, so every policy ON storage.objects was dropped.
-- The bucket rows and objects were copied as data, but with RLS on and no
-- policies, storage.objects denies every non-service-role request: avatar,
-- banner, resume, attachment and skill-file uploads fail, and reads of the
-- private buckets fail. (The auth.users triggers were restored separately in
-- 20260926194500_restore_auth_users_triggers.sql.)
--
-- These are the final definitions after replaying every migration in order:
-- "Users can view own attachments" was replaced by "Conversation participants
-- can view attachments" in 20260320093500 and is not restored.
--
-- Idempotent: safe to re-run.

-- from 003_storage_buckets.sql
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- from 003_storage_buckets.sql
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 003_storage_buckets.sql
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 003_storage_buckets.sql
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 003_storage_buckets.sql
DROP POLICY IF EXISTS "Users can upload own attachments" ON storage.objects;
CREATE POLICY "Users can upload own attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 003_storage_buckets.sql
DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;
CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 20260113100000_resume_storage.sql
DROP POLICY IF EXISTS "Users can upload their own resume" ON storage.objects;
CREATE POLICY "Users can upload their own resume"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resumes'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- from 20260113100000_resume_storage.sql
DROP POLICY IF EXISTS "Users can update their own resume" ON storage.objects;
CREATE POLICY "Users can update their own resume"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'resumes'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- from 20260113100000_resume_storage.sql
DROP POLICY IF EXISTS "Users can delete their own resume" ON storage.objects;
CREATE POLICY "Users can delete their own resume"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'resumes'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- from 20260113100000_resume_storage.sql
DROP POLICY IF EXISTS "Resumes are publicly readable" ON storage.objects;
CREATE POLICY "Resumes are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes');

-- from 20260201130000_profile_banner.sql
DROP POLICY IF EXISTS "Banners are publicly accessible" ON storage.objects;
CREATE POLICY "Banners are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banners');

-- from 20260201130000_profile_banner.sql
DROP POLICY IF EXISTS "Users can upload own banner" ON storage.objects;
CREATE POLICY "Users can upload own banner"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 20260201130000_profile_banner.sql
DROP POLICY IF EXISTS "Users can update own banner" ON storage.objects;
CREATE POLICY "Users can update own banner"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 20260201130000_profile_banner.sql
DROP POLICY IF EXISTS "Users can delete own banner" ON storage.objects;
CREATE POLICY "Users can delete own banner"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- from 20260311120000_skill_social_and_storage.sql
DROP POLICY IF EXISTS "Sellers upload own skill files" ON storage.objects;
CREATE POLICY "Sellers upload own skill files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'skill-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- from 20260311120000_skill_social_and_storage.sql
DROP POLICY IF EXISTS "Sellers update own skill files" ON storage.objects;
CREATE POLICY "Sellers update own skill files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'skill-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- from 20260320093500_fix_attachment_view_policy.sql
DROP POLICY IF EXISTS "Conversation participants can view attachments" ON storage.objects;
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
