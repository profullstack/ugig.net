import { describe, expect, it } from "vitest";
import { gigSchema } from "@/lib/validations";
import { GIG_TEMPLATES, PAY_PER_PR_TEMPLATE, gigTemplate } from "@/lib/gig-templates";

describe("gig templates", () => {
  it("finds a template by id and ignores unknown or empty ids", () => {
    expect(gigTemplate("pay-per-pr")).toBe(PAY_PER_PR_TEMPLATE);
    expect(gigTemplate("nope")).toBeUndefined();
    expect(gigTemplate(undefined)).toBeUndefined();
    expect(gigTemplate("")).toBeUndefined();
  });

  it("every template is a valid hiring post once the poster picks a skill", () => {
    for (const template of GIG_TEMPLATES) {
      const result = gigSchema.safeParse({
        ...template.data,
        skills_required: ["TypeScript"],
        status: "active",
      });
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("pay-per-pr prices per merged PR, 25 cents to a dollar", () => {
    expect(PAY_PER_PR_TEMPLATE.data).toMatchObject({
      listing_type: "hiring",
      budget_type: "per_unit",
      budget_unit: "merged PR",
      budget_min: 0.25,
      budget_max: 1,
    });
  });
});
