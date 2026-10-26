-- Rotate the /api/auth/confirmed webhook secret out of git.
--
-- 20260216040001_fix_webhook_secret.sql hardcoded the shared secret in
-- handle_auth_user_confirmed(), so it has been public since February. That
-- value is now dead: the app only accepts the new secret, and the trigger reads
-- it at call time from private.app_secrets, which this migration creates but
-- does NOT fill. Set it by hand on each database (never commit it):
--
--   INSERT INTO private.app_secrets (name, value)
--   VALUES ('auth_webhook_secret', '<same value as AUTH_WEBHOOK_SECRET>')
--   ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
--
-- The private schema is not in PostgREST's exposed schemas and is granted to
-- nobody but its owner, so only SECURITY DEFINER functions owned by postgres
-- can read it.
--
-- Also here:
--   * auth_confirmed_processed: one row per user the webhook has handled, so the
--     welcome email, Lightning wallet and referral reward happen at most once
--     per user even if someone replays the webhook with the right secret.
--     Backfilled with every already-confirmed user.
--   * pay_referral_reward(): the 2026-08-01 function never made it onto the
--     dev2 stack (the 2026-09-25 move), so every reward attempt errored.
--     Re-created verbatim; it is itself once-per-referred-user.
--   * notification_type gains 'referral_reward' (the referrer notification
--     insert always failed on the enum).
--
-- Idempotent: safe to re-run.

-- ── Private secret store ──────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.app_secrets FROM PUBLIC;
REVOKE ALL ON private.app_secrets FROM anon, authenticated, service_role;

-- ── Trigger: read the secret at call time ─────────────────────────
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  payload jsonb;
BEGIN
  -- Only fire when email_confirmed_at changes from NULL to a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    SELECT s.value INTO v_secret
    FROM private.app_secrets s
    WHERE s.name = 'auth_webhook_secret';

    IF v_secret IS NULL OR v_secret = '' THEN
      RAISE WARNING 'handle_auth_user_confirmed: private.app_secrets has no auth_webhook_secret; webhook not sent for %', NEW.id;
      RETURN NEW;
    END IF;

    payload := jsonb_build_object(
      'type', 'UPDATE',
      'record', jsonb_build_object(
        'id', NEW.id,
        'email', NEW.email,
        'email_confirmed_at', NEW.email_confirmed_at
      ),
      'old_record', jsonb_build_object(
        'id', OLD.id,
        'email', OLD.email,
        'email_confirmed_at', OLD.email_confirmed_at
      )
    );

    PERFORM net.http_post(
      url := 'https://ugig.net/api/auth/confirmed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := payload
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_auth_user_confirmed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_auth_user_confirmed() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_confirmed();

-- ── Once-per-user ledger for the confirmation webhook ─────────────
CREATE TABLE IF NOT EXISTS public.auth_confirmed_processed (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_confirmed_processed ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) touches it.
REVOKE ALL ON public.auth_confirmed_processed FROM PUBLIC;
REVOKE ALL ON public.auth_confirmed_processed FROM anon, authenticated;
GRANT SELECT, INSERT ON public.auth_confirmed_processed TO service_role;

-- Everyone already confirmed has had (or missed) their welcome flow.
INSERT INTO public.auth_confirmed_processed (user_id, processed_at)
SELECT u.id, u.email_confirmed_at
FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── notification_type: referral_reward ────────────────────────────
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'referral_reward';

-- ── pay_referral_reward (missing on the dev2 stack) ───────────────
CREATE OR REPLACE FUNCTION public.pay_referral_reward(
  p_referred_user_id uuid,
  p_reward_sats bigint DEFAULT 25
)
RETURNS TABLE(
  referrer_id uuid,
  referrer_balance bigint,
  referred_balance bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_referrer_balance bigint;
  v_referred_balance bigint;
BEGIN
  IF p_reward_sats <= 0 THEN
    RAISE EXCEPTION 'Referral reward must be positive';
  END IF;

  -- Serialize attempts for the same referred user, including duplicate rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_referred_user_id::text, 0));

  -- Any paid record means this user has already received the one-time reward.
  IF EXISTS (
    SELECT 1
    FROM public.referrals r
    WHERE r.referred_user_id = p_referred_user_id
      AND r.status = 'registered'
      AND r.reward_paid IS TRUE
  ) THEN
    RETURN;
  END IF;

  SELECT r.referrer_id
  INTO v_referrer_id
  FROM public.referrals r
  WHERE r.referred_user_id = p_referred_user_id
    AND r.status = 'registered'
    AND COALESCE(r.reward_paid, false) = false
  ORDER BY r.registered_at NULLS LAST, r.created_at, r.id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.wallets AS wallet (user_id, balance_sats)
  VALUES (v_referrer_id, p_reward_sats)
  ON CONFLICT (user_id) DO UPDATE
  SET balance_sats = wallet.balance_sats + EXCLUDED.balance_sats,
      updated_at = now()
  RETURNING wallet.balance_sats INTO v_referrer_balance;

  INSERT INTO public.wallets AS wallet (user_id, balance_sats)
  VALUES (p_referred_user_id, p_reward_sats)
  ON CONFLICT (user_id) DO UPDATE
  SET balance_sats = wallet.balance_sats + EXCLUDED.balance_sats,
      updated_at = now()
  RETURNING wallet.balance_sats INTO v_referred_balance;

  INSERT INTO public.wallet_transactions (
    user_id,
    type,
    amount_sats,
    balance_after,
    status,
    reference_id
  )
  VALUES
    (v_referrer_id, 'deposit', p_reward_sats, v_referrer_balance, 'completed', p_referred_user_id),
    (p_referred_user_id, 'deposit', p_reward_sats, v_referred_balance, 'completed', v_referrer_id);

  -- Mark every matching record so historical duplicates cannot be paid later.
  UPDATE public.referrals r
  SET reward_paid = true
  WHERE r.referred_user_id = p_referred_user_id
    AND r.status = 'registered';

  RETURN QUERY
  SELECT v_referrer_id, v_referrer_balance, v_referred_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_referral_reward(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_referral_reward(uuid, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.pay_referral_reward(uuid, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pay_referral_reward(uuid, bigint) TO service_role;
