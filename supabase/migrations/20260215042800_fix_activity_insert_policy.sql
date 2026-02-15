-- Fix: Allow authenticated users to insert their own activities
-- The previous policy (auth.uid() IS NULL) blocked all client-side inserts
-- from logActivity() which uses the authenticated user's supabase client.

DROP POLICY IF EXISTS "Service role can insert activities" ON public.activities;

-- Allow users to insert their own activities
CREATE POLICY "Users can insert own activities"
  ON public.activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow service role / triggers to insert activities for any user
CREATE POLICY "Service role can insert activities"
  ON public.activities FOR INSERT
  WITH CHECK (auth.uid() IS NULL);
