-- Pay referral rewards exactly once, even when confirmation webhooks overlap.
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
    (
      v_referrer_id,
      'deposit',
      p_reward_sats,
      v_referrer_balance,
      'completed',
      p_referred_user_id
    ),
    (
      p_referred_user_id,
      'deposit',
      p_reward_sats,
      v_referred_balance,
      'completed',
      v_referrer_id
    );

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
