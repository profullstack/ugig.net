import { describe, it, expect } from "vitest";
import {
  addTeamMemberSchema,
  canManageTeam,
  createTeamSchema,
  formatHourlyRate,
  parseRateInput,
  resolveBillableRate,
  slugifyTeamName,
  updateTeamProjectSchema,
} from "./teams";

describe("slugifyTeamName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyTeamName("Profullstack Core")).toBe("profullstack-core");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugifyTeamName("  A&B   Consulting, Inc. ")).toBe("a-b-consulting-inc");
  });

  it("never leaves a trailing hyphen, even after truncation", () => {
    const slug = slugifyTeamName(`${"a".repeat(59)} team`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns an empty string when there is nothing to slug", () => {
    expect(slugifyTeamName("!!!")).toBe("");
  });
});

describe("resolveBillableRate", () => {
  it("falls back to the team rate when nothing overrides it", () => {
    expect(resolveBillableRate({ teamRate: 150 })).toEqual({ rate: 150, source: "team" });
  });

  it("prefers the project rate over the team rate", () => {
    expect(resolveBillableRate({ teamRate: 150, projectRate: 200 })).toEqual({
      rate: 200,
      source: "project",
    });
  });

  it("prefers the member rate over the project rate", () => {
    expect(resolveBillableRate({ teamRate: 150, projectRate: 200, memberRate: 90 })).toEqual({
      rate: 90,
      source: "member",
    });
  });

  it("prefers the assignment rate over everything else", () => {
    expect(
      resolveBillableRate({
        teamRate: 150,
        projectRate: 200,
        memberRate: 90,
        assignmentRate: 275,
      })
    ).toEqual({ rate: 275, source: "assignment" });
  });

  it("treats zero as a real rate, not as unset", () => {
    expect(resolveBillableRate({ teamRate: 150, memberRate: 0 })).toEqual({
      rate: 0,
      source: "member",
    });
  });

  it("treats null as inherit", () => {
    expect(resolveBillableRate({ teamRate: 150, projectRate: null, memberRate: null })).toEqual({
      rate: 150,
      source: "team",
    });
  });
});

describe("formatHourlyRate", () => {
  it("renders a per-hour amount", () => {
    expect(formatHourlyRate(150)).toBe("$150/hr");
  });

  it("says so when no rate is set", () => {
    expect(formatHourlyRate(null)).toBe("Not set");
  });
});

describe("parseRateInput", () => {
  it("reads an empty field as inherit", () => {
    expect(parseRateInput("")).toBeNull();
    expect(parseRateInput("   ")).toBeNull();
    expect(parseRateInput(null)).toBeNull();
  });

  it("reads a numeric string as a rate", () => {
    expect(parseRateInput("125.50")).toBe(125.5);
    expect(parseRateInput("0")).toBe(0);
  });

  it("rejects nonsense", () => {
    expect(parseRateInput("abc")).toBeNull();
  });
});

describe("canManageTeam", () => {
  it("allows owners and admins only", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("member")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });
});

describe("schemas", () => {
  it("defaults a new team to a zero rate", () => {
    const parsed = createTeamSchema.parse({ name: "Core" });
    expect(parsed.billable_rate_usd).toBe(0);
  });

  it("rejects a negative rate", () => {
    expect(createTeamSchema.safeParse({ name: "Core", billable_rate_usd: -1 }).success).toBe(false);
  });

  it("requires some way to identify a new member", () => {
    expect(addTeamMemberSchema.safeParse({ role: "member" }).success).toBe(false);
    expect(addTeamMemberSchema.safeParse({ username: "preshy" }).success).toBe(true);
    expect(addTeamMemberSchema.safeParse({ email: "preshy@example.com" }).success).toBe(true);
  });

  it("accepts a null rate as an explicit inherit", () => {
    const parsed = updateTeamProjectSchema.parse({ billable_rate_usd: null });
    expect(parsed.billable_rate_usd).toBeNull();
  });
});
