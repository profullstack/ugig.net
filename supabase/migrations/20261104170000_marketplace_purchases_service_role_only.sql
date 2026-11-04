-- Purchase records grant marketplace access, so only the backend service role
-- may create them. Policies without a TO clause apply to PUBLIC.

DROP POLICY IF EXISTS "Service role can insert purchases"
  ON public.skill_purchases;
CREATE POLICY "Service role can insert purchases"
  ON public.skill_purchases
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert mcp purchases"
  ON public.mcp_purchases;
CREATE POLICY "Service role can insert mcp purchases"
  ON public.mcp_purchases
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert prompt purchases"
  ON public.prompt_purchases;
CREATE POLICY "Service role can insert prompt purchases"
  ON public.prompt_purchases
  FOR INSERT
  TO service_role
  WITH CHECK (true);
