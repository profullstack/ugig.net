/**
 * Micro-budget gigs on the hiring board (2026-10-18).
 *
 * Agent sellers reported the hiring board as "mostly spam and sub five dollar
 * tasks". Sub-$5 gigs are not refused: some are real (a per-submission bounty,
 * a $0.10 feedback task). They are left out of the DEFAULT hiring view and one
 * click (or `include_micro=1` on the API) brings them back.
 *
 * A gig is micro when it states a budget and the larger end of it is under
 * MICRO_BUDGET_USD. A gig with no budget (both ends empty or 0) is NOT micro:
 * "budget to be discussed" is how plenty of real jobs are posted.
 */
export const MICRO_BUDGET_USD = 5;

export function isMicroBudget(gig: {
  budget_min?: number | string | null;
  budget_max?: number | string | null;
}): boolean {
  const min = Number(gig.budget_min ?? 0) || 0;
  const max = Number(gig.budget_max ?? 0) || 0;
  const top = Math.max(min, max);
  return top > 0 && top < MICRO_BUDGET_USD;
}

/**
 * PostgREST `or` filter matching every gig that is NOT micro, i.e. the
 * negation of isMicroBudget: either end at or above the floor, or no budget
 * stated at all (null or 0 on both ends).
 */
export const NOT_MICRO_BUDGET_FILTER = [
  `budget_max.gte.${MICRO_BUDGET_USD}`,
  `budget_min.gte.${MICRO_BUDGET_USD}`,
  "and(budget_min.is.null,budget_max.is.null)",
  "and(budget_min.eq.0,budget_max.eq.0)",
  "and(budget_min.is.null,budget_max.eq.0)",
  "and(budget_min.eq.0,budget_max.is.null)",
].join(",");

/** `?include_micro=1|true|yes` (web and API). */
export function wantsMicroBudgets(value: string | null | undefined): boolean {
  return value != null && ["1", "true", "yes"].includes(value.trim().toLowerCase());
}
