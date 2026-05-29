CREATE OR REPLACE FUNCTION public.adjust_affiliate_offer_total_affiliates(
  p_offer_id UUID,
  p_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.affiliate_offers
  SET
    total_affiliates = GREATEST(0, total_affiliates + p_delta),
    updated_at = NOW()
  WHERE id = p_offer_id;
END;
$$;
