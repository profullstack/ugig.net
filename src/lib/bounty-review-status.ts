/**
 * What a bounty submitter should be told about their submission.
 *
 * `bounty_submissions.status` starts at `pending` and only the bounty's
 * CREATOR moves it (approve / reject, RLS "Creators can update submissions on
 * their bounty"). ugig staff do not review bounty submissions. The UI used to
 * show a bare "Pending" with no hint of who acts or when, so submitters waited
 * for days with no signal. This spells it out, for the UI and the API alike.
 */

/**
 * Creators who review at all usually do it fast: across prod on 2026-10-17 the
 * median time to a decision was ~1.1 days (49 reviewed). Many never review.
 */
export const TYPICAL_REVIEW_DAYS = 2;
/** After this long with no decision, tell the submitter to nudge the creator. */
export const NUDGE_AFTER_DAYS = 7;

export type SubmissionReviewState =
  | "awaiting_creator_review"
  | "bounty_closed_unreviewed"
  | "approved_awaiting_payment"
  | "paid"
  | "rejected";

export interface SubmissionReviewInput {
  status: string;
  payout_status?: string | null;
  created_at: string;
  review_notes?: string | null;
}

export interface SubmissionReviewBounty {
  status?: string | null;
  creator_username?: string | null;
}

export interface SubmissionReview {
  state: SubmissionReviewState;
  /** Short badge text. */
  label: string;
  /** Who acts next and what happens, in one or two sentences. */
  message: string;
  /** Whole days since the submission was made. */
  waiting_days: number;
  reviewer: "bounty_creator";
  typical_review_days: number;
  /** Profile to message when it is stuck, if known. */
  contact_url: string | null;
}

export function submissionReview(
  submission: SubmissionReviewInput,
  bounty: SubmissionReviewBounty = {},
  now: Date = new Date()
): SubmissionReview {
  const waiting_days = Math.max(
    0,
    Math.floor((now.getTime() - new Date(submission.created_at).getTime()) / 86_400_000)
  );
  const who = bounty.creator_username ? `@${bounty.creator_username}` : "the bounty's creator";
  const contact_url = bounty.creator_username ? `/u/${bounty.creator_username}` : null;
  const base = { waiting_days, reviewer: "bounty_creator" as const, typical_review_days: TYPICAL_REVIEW_DAYS, contact_url };

  if (submission.status === "rejected") {
    return {
      ...base,
      state: "rejected",
      label: "Rejected",
      message: submission.review_notes
        ? `Rejected by ${who}: ${submission.review_notes}`
        : `Rejected by ${who}.`,
    };
  }

  if (submission.status === "approved") {
    if (submission.payout_status === "paid") {
      return { ...base, state: "paid", label: "Paid", message: `Approved by ${who} and paid.` };
    }
    return {
      ...base,
      state: "approved_awaiting_payment",
      label: "Approved, awaiting payment",
      message: `Approved by ${who}. Payment is sent by the creator to the payout wallet on your profile in the bounty's coin.`,
    };
  }

  const open = !bounty.status || bounty.status === "open";
  if (!open) {
    return {
      ...base,
      state: "bounty_closed_unreviewed",
      label: "Not reviewed",
      message:
        `${who} ${bounty.status === "archived" ? "archived" : "closed"} this bounty without reviewing your submission. ` +
        `Only the creator can approve it; message them if you think it should still be paid.`,
    };
  }

  const stuck = waiting_days >= NUDGE_AFTER_DAYS;
  return {
    ...base,
    state: "awaiting_creator_review",
    label: "Awaiting creator review",
    message:
      `Waiting for ${who} to review it. Bounty submissions are reviewed by the person who posted the bounty, not by ugig staff; ` +
      `creators who review usually decide within ${TYPICAL_REVIEW_DAYS} days.` +
      (stuck
        ? ` It has been ${waiting_days} days, so message ${who} to nudge them.`
        : ` You'll get a notification when it is approved or rejected.`),
  };
}
