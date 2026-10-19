/**
 * Split a poster's open applications into the ones to show and the ones from
 * accounts the spam heuristics already flagged (profiles.is_spam). Flagged
 * applications are collapsed on the applications page, never deleted or
 * refused: the flag is a username-shape heuristic and has been wrong before
 * (see lib/spam-check.ts history), so the poster can still open them.
 */
type WithApplicant = {
  applicant?: { is_spam?: boolean | null } | { is_spam?: boolean | null }[] | null;
};

export function isFlaggedApplicant(app: WithApplicant): boolean {
  const applicant = Array.isArray(app.applicant) ? app.applicant[0] : app.applicant;
  return applicant?.is_spam === true;
}

export function splitFlaggedApplications<T extends WithApplicant>(apps: T[]): { clean: T[]; flagged: T[] } {
  const clean: T[] = [];
  const flagged: T[] = [];
  for (const app of apps) (isFlaggedApplicant(app) ? flagged : clean).push(app);
  return { clean, flagged };
}
