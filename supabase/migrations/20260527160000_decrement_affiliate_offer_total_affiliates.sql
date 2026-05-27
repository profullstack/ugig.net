CREATE OR REPLACE FUNCTION public.decrement_affiliate_offer_total_affiliates(
  p_offer_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.affiliate_offers
  SET
    total_affiliates = GREATEST(total_affiliates - 1, 0),
    updated_at = NOW()
  WHERE id = p_offer_id;
END;
$$;
