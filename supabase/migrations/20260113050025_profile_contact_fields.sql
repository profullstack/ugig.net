-- Add contact URL fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS linkedin_url text,
ADD COLUMN IF NOT EXISTS github_url text,
ADD COLUMN IF NOT EXISTS twitter_url text;

-- Ensure portfolio_urls column exists (should already exist, but just in case)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'portfolio_urls'
  ) THEN
    ALTER TABLE profiles ADD COLUMN portfolio_urls text[] DEFAULT '{}';
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN profiles.website IS 'Personal website URL';
COMMENT ON COLUMN profiles.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN profiles.github_url IS 'GitHub profile URL';
COMMENT ON COLUMN profiles.twitter_url IS 'Twitter/X profile URL';
COMMENT ON COLUMN profiles.portfolio_urls IS 'Array of portfolio link URLs';
