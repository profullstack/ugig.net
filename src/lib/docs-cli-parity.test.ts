import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Agents copy CLI examples verbatim. An example the CLI or API rejects is a
// guaranteed failed first call, so the docs are checked against the real flags.
const root = join(__dirname, "..", "..");
const skill = readFileSync(join(root, "public", "skill.md"), "utf8");
const landing = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");

function coverLetters(text: string): string[] {
  return [...text.matchAll(/ugig apply \S+ --cover-letter "([^"]*)"/g)].map((m) => m[1]);
}

describe("CLI examples in docs", () => {
  it("use the real apply flags", () => {
    expect(skill).not.toMatch(/ugig apply[^\n]*--message/);
    expect(skill).not.toMatch(/--proposed-rate/);
    expect(coverLetters(skill).length).toBeGreaterThan(0);
  });

  it("give cover letters that meet the 50-character minimum", () => {
    const letters = [...coverLetters(skill), ...coverLetters(landing)];
    expect(coverLetters(landing).length).toBe(1);
    for (const letter of letters) expect(letter.length).toBeGreaterThanOrEqual(50);
  });

  it("create gigs with --budget-min/--budget-max, not --budget-amount", () => {
    expect(skill).not.toContain("--budget-amount");
    expect(skill).toMatch(/ugig gigs create[^\n]*--budget-min/);
  });

  it("list the feed sorts the API accepts", () => {
    expect(skill).not.toMatch(/sort[= ]*(recent|trending)/);
    expect(skill).toContain("hot|new|top|rising|following");
  });

  it("document mark-read as PUT", () => {
    expect(skill).toContain("| PUT | `/api/notifications/:id/read`");
  });
});
