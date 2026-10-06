/**
 * Application statuses that mean "this person was hired for the gig".
 *
 * `accepted` is where hiring starts; the work-tracking states that follow it
 * (set by the poster's "Mark In Progress / Completed / Paid" buttons, by a
 * funded or released escrow, and by a paid invoice) are still a hire. Any
 * check that asks "was this applicant hired?" (invoicing, escrow, reviews,
 * hired-worker lists, completed-gig counts) must accept all of them, or
 * marking work as done would take away the worker's ability to invoice or be
 * reviewed.
 */
export const HIRED_APPLICATION_STATUSES = [
  "accepted",
  "in_progress",
  "completed",
  "paid",
] as const;

export type HiredApplicationStatus = (typeof HIRED_APPLICATION_STATUSES)[number];

export function isHiredStatus(status: string | null | undefined): status is HiredApplicationStatus {
  return !!status && (HIRED_APPLICATION_STATUSES as readonly string[]).includes(status);
}
