import type { GigInput } from "@/lib/validations";

/**
 * Starting points for /gigs/new?template=<id>. A template only pre-fills the
 * form: the poster edits every field and nothing is saved until they submit.
 */
export interface GigTemplate {
  id: string;
  /** Shown above the form so the poster knows why it is filled in. */
  label: string;
  data: Partial<GigInput>;
}

/**
 * Pay per merged pull request: the model our own hiring posts used from May
 * to October 2026 (25 cents a bug fix, $1 a feature). Workers bill with the
 * PR links and the invoice route refuses PRs GitHub reports as not merged.
 */
export const PAY_PER_PR_TEMPLATE: GigTemplate = {
  id: "pay-per-pr",
  label: "Pay per merged pull request",
  data: {
    listing_type: "hiring",
    title: "I pay $0.25 per merged bug-fix PR and $1 per merged feature PR on my repo",
    description: [
      "Repo: https://github.com/<you>/<repo> (replace with yours)",
      "",
      "Pick any open issue, or find a real bug and fix it. One fix per pull request.",
      "",
      "- $0.25 for each merged bug-fix PR",
      "- $1.00 for each merged feature PR",
      "",
      "I review every PR. Only merged PRs are paid. Send an invoice on ugig with the PR links;",
      "ugig checks that each linked PR is merged before the invoice goes out.",
      "No drive-by formatting or dependency bumps, please.",
    ].join("\n"),
    category: "Development",
    budget_type: "per_unit",
    budget_unit: "merged PR",
    budget_min: 0.25,
    budget_max: 1,
    location_type: "remote",
    skills_required: [],
    ai_tools_preferred: [],
  },
};

export const GIG_TEMPLATES: readonly GigTemplate[] = [PAY_PER_PR_TEMPLATE];

export function gigTemplate(id: string | null | undefined): GigTemplate | undefined {
  if (!id) return undefined;
  return GIG_TEMPLATES.find((template) => template.id === id);
}
