import { formatBountyPayout } from "@/lib/bounties";

// The status comment ugig posts on a GitHub issue a bounty funds. One body
// per lifecycle moment so the wording stays in one place wherever it is
// edited: creation in the bounties route, archive/delete/reopen in the
// bounty route, "paid" in the CoinPay webhook.

export function bountyAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net").replace(/\/$/, "");
}

interface CommentBounty {
  id: string;
  title: string;
  payout_usd: number | string;
  payment_coin: string | null;
}

export function bountyPostedCommentBody(bounty: CommentBounty): string {
  const appUrl = bountyAppUrl();
  const bountyUrl = `${appUrl}/bounties/${bounty.id}`;
  return (
    `💰 **Bounty posted on [ugig.net](${appUrl})** — ${formatBountyPayout(bounty.payout_usd, bounty.payment_coin)}\n\n` +
    `**${bounty.title}**\n\n` +
    `[Claim this bounty →](${bountyUrl})\n\n` +
    `<sub>Posted automatically by ugig.net.</sub>`
  );
}

/** The bounty was archived or deleted, so the claim link no longer resolves. */
export function bountyWithdrawnCommentBody(bounty: Pick<CommentBounty, "title">): string {
  const appUrl = bountyAppUrl();
  return (
    `🗄️ **Bounty withdrawn on [ugig.net](${appUrl})** — "${bounty.title}" is no longer open for submissions.\n\n` +
    `<sub>Updated automatically by ugig.net.</sub>`
  );
}
