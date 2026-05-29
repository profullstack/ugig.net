CREATE OR REPLACE FUNCTION public.moderate_affiliate_application(
  p_offer_id UUID,
  p_application_id UUID,
  p_seller_id UUID,
  p_status TEXT
)
RETURNS public.affiliate_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.affiliate_offers%ROWTYPE;
  v_existing public.affiliate_applications%ROWTYPE;
  v_updated public.affiliate_applications%ROWTYPE;
  v_delta INTEGER := 0;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid affiliate application status';
  END IF;

  SELECT *
  INTO v_offer
  FROM public.affiliate_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF v_offer.id IS NULL OR v_offer.seller_id <> p_seller_id THEN
    RAISE EXCEPTION 'Not found or not authorized';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.affiliate_applications
  WHERE id = p_application_id
    AND offer_id = p_offer_id
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_existing.status <> 'approved' AND p_status = 'approved' THEN
    v_delta := 1;
  ELSIF v_existing.status = 'approved' AND p_status <> 'approved' THEN
    v_delta := -1;
  END IF;

  UPDATE public.affiliate_applications
  SET
    status = p_status::public.affiliate_application_status,
    approved_at = CASE
      WHEN p_status = 'approved' THEN COALESCE(approved_at, NOW())
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_application_id
    AND offer_id = p_offer_id
  RETURNING * INTO v_updated;

  IF v_delta <> 0 THEN
    UPDATE public.affiliate_offers
    SET
      total_affiliates = GREATEST(0, total_affiliates + v_delta),
      updated_at = NOW()
    WHERE id = p_offer_id;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_affiliate_application(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_affiliate_application(UUID, UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.moderate_affiliate_application(UUID, UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_affiliate_application(UUID, UUID, UUID, TEXT) TO service_role;
