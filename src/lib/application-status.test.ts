import { describe, it, expect } from "vitest";
import { HIRED_APPLICATION_STATUSES, isHiredStatus } from "./application-status";
import { applicationStatusSchema } from "./validations";
import { Constants } from "@/types/supabase";

describe("application statuses", () => {
  it("treats every work-tracking state as hired", () => {
    for (const s of ["accepted", "in_progress", "completed", "paid"]) {
      expect(isHiredStatus(s)).toBe(true);
    }
  });

  it("does not treat undecided or closed applications as hired", () => {
    for (const s of ["pending", "reviewing", "shortlisted", "rejected", "withdrawn", "", null, undefined]) {
      expect(isHiredStatus(s)).toBe(false);
    }
  });

  it("every hired status is a value the API accepts and the DB enum has", () => {
    const dbEnum: readonly string[] = Constants.public.Enums.application_status;
    for (const s of HIRED_APPLICATION_STATUSES) {
      expect(applicationStatusSchema.safeParse({ status: s }).success).toBe(true);
      expect(dbEnum).toContain(s);
    }
  });

  it("the API schema accepts nothing the DB enum would reject", () => {
    const dbEnum: readonly string[] = Constants.public.Enums.application_status;
    for (const s of applicationStatusSchema.shape.status.options) {
      expect(dbEnum).toContain(s);
    }
  });
});
