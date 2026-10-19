import { describe, it, expect } from "vitest";
import { isFlaggedApplicant, splitFlaggedApplications } from "./flagged";

describe("splitFlaggedApplications", () => {
  it("moves applications from is_spam accounts aside, keeping order", () => {
    const apps = [
      { id: "1", applicant: { is_spam: false } },
      { id: "2", applicant: { is_spam: true } },
      { id: "3", applicant: [{ is_spam: true }] },
      { id: "4", applicant: null },
      { id: "5", applicant: {} },
    ];
    const { clean, flagged } = splitFlaggedApplications(apps);
    expect(clean.map((a) => a.id)).toEqual(["1", "4", "5"]);
    expect(flagged.map((a) => a.id)).toEqual(["2", "3"]);
  });

  it("only an explicit true flags (unknown is shown)", () => {
    expect(isFlaggedApplicant({ applicant: { is_spam: null } })).toBe(false);
  });
});
