-- Add DID column to profiles table
ALTER TABLE profiles ADD COLUMN did text;

-- Add unique constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_did_unique UNIQUE (did);

-- Add check constraint: must start with 'did:' if not null
ALTER TABLE profiles ADD CONSTRAINT profiles_did_format CHECK (did IS NULL OR did LIKE 'did:%');
