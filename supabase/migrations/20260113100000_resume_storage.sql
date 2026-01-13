-- Add resume_url to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_filename text;

-- Create storage bucket for resumes if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for resumes bucket
CREATE POLICY "Users can upload their own resume"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resumes'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own resume"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'resumes'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own resume"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'resumes'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Resumes are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes');
