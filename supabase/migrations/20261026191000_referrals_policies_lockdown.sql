-- referrals RLS lockdown (follow-up to the auth webhook rotation).
--
-- "Service role can update referrals" had no TO clause, so it applied to every
-- role: any signed-in user could rewrite any referral row through PostgREST,
-- e.g. point someone else's referral at themselves before it pays out. The
-- service role bypasses RLS anyway, so the policy is now scoped to it.
--
-- The insert policy only checked referrer_id, so a user could insert a row
-- that was already 'registered' for any referred_user_id and collect that
-- user's referral reward. Users may now only create pending invites; the
-- signup route (service role) is what marks a referral registered.
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Service role can update referrals" ON public.referrals;
CREATE POLICY "Service role can update referrals" ON public.referrals
  FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can insert their own referrals" ON public.referrals;
CREATE POLICY "Users can insert their own referrals" ON public.referrals
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = referrer_id
    AND status = 'pending'
    AND referred_user_id IS NULL
    AND registered_at IS NULL
    AND COALESCE(reward_paid, false) = false
  );
