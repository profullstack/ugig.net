-- Link a bounty to the GitHub issue it funds (pattern B: link + bot comment).
-- github_issue_url is the canonical issue URL the creator pasted.
-- github_comment_id stores the id of the status comment the ugig GitHub App
-- posted on that issue, so we can edit it in place when the bounty is paid.
ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS github_issue_url text,
  ADD COLUMN IF NOT EXISTS github_comment_id bigint;
