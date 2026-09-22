-- Bounties gain an `archived` status. Archiving keeps the bounty and every
-- submission (approvals, invoices, payouts) but hides it from the public
-- list, the public detail page and the creator's active dashboard list.
-- Hard deletion stays DELETE /api/bounties/:id, refused once money has moved.

ALTER TABLE bounties DROP CONSTRAINT IF EXISTS bounties_status_check;
ALTER TABLE bounties
  ADD CONSTRAINT bounties_status_check
  CHECK (status IN ('open', 'paused', 'closed', 'archived'));

-- Archived bounties are creator-only, like closed ones.
DROP POLICY IF EXISTS "Bounties are publicly readable when not closed" ON bounties;
CREATE POLICY "Bounties are publicly readable when not closed"
  ON bounties FOR SELECT
  USING (status NOT IN ('closed', 'archived') OR auth.uid() = creator_id);
