-- ugig.net Storage Buckets
-- Run this after 002_rls_policies.sql

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- AVATARS BUCKET POLICIES
-- =============================================

-- Anyone can view avatars (public bucket)
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Users can upload their own avatar
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own avatar
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================
-- ATTACHMENTS BUCKET POLICIES
-- =============================================

-- Users can view their own attachments
CREATE POLICY "Users can view own attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload their own attachments
CREATE POLICY "Users can upload own attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own attachments
CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
