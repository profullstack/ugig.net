import { describe, it, expect } from "vitest";
import {
  HIRED_APPLICATION_STATUSES,
  STATUSES_NOTIFIED_BY_TRIGGER,
  isHiredStatus,
  triggerNotifiesStatus,
} from "./application-status";
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

describe("STATUSES_NOTIFIED_BY_TRIGGER", () => {
  it("matches the statuses the latest notify_on_application_status_change migration handles", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "supabase/migrations");
    const latest = fs
      .readdirSync(dir)
      .filter((f) => /FUNCTION\s+(public\.)?notify_on_application_status_change/i.test(fs.readFileSync(path.join(dir, f), "utf8")))
      .sort()
      .pop()!;
    const sql = fs.readFileSync(path.join(dir, latest), "utf8");
    const handled = [...sql.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((m) => m[1]).sort();
    expect(handled).toEqual([...STATUSES_NOTIFIED_BY_TRIGGER].sort());
  });

  it("routes notify for the statuses the trigger skips", () => {
    expect(triggerNotifiesStatus("accepted")).toBe(true);
    expect(triggerNotifiesStatus("completed")).toBe(false);
    expect(triggerNotifiesStatus("paid")).toBe(false);
  });
});
