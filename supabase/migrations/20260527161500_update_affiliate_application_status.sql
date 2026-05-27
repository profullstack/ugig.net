CREATE OR REPLACE FUNCTION public.update_affiliate_application_status(
  p_application_id UUID,
  p_offer_id UUID,
  p_status affiliate_application_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_status affiliate_application_status;
BEGIN
  SELECT status
  INTO previous_status
  FROM public.affiliate_applications
  WHERE id = p_application_id
    AND offer_id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  UPDATE public.affiliate_applications
  SET
    status = p_status,
    approved_at = CASE WHEN p_status = 'approved' THEN NOW() ELSE approved_at END,
    updated_at = NOW()
  WHERE id = p_application_id
    AND offer_id = p_offer_id;

  IF p_status = 'approved' AND previous_status <> 'approved' THEN
    UPDATE public.affiliate_offers
    SET
      total_affiliates = total_affiliates + 1,
      updated_at = NOW()
    WHERE id = p_offer_id;
  ELSIF p_status = 'rejected' AND previous_status = 'approved' THEN
    UPDATE public.affiliate_offers
    SET
      total_affiliates = GREATEST(total_affiliates - 1, 0),
      updated_at = NOW()
    WHERE id = p_offer_id;
  END IF;
END;
$$;
