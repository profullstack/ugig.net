-- ugig invite bonus: each side of an invite gets its Pro days once.
-- src/lib/credits.ts grants with source 'invite:<inviteId>:<inviter|invitee>';
-- this index makes a second (racing) grant fail instead of extending Pro twice.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_invite_grant_once
  ON public.credit_ledger (user_id, source)
  WHERE kind = 'grant' AND source LIKE 'invite:%';
