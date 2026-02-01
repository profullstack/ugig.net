-- Add banner_url column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Create banners storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view banners (public bucket)
CREATE POLICY "Banners are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banners');

-- Users can upload their own banner
CREATE POLICY "Users can upload own banner"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own banner
CREATE POLICY "Users can update own banner"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own banner
CREATE POLICY "Users can delete own banner"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
