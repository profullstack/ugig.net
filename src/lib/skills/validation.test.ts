import { describe, it, expect } from "vitest";
import { slugify, skillListingSchema, skillReviewSchema } from "./validation";

describe("slugify", () => {
  it("converts title to lowercase slug", () => {
    expect(slugify("My Cool Skill")).toBe("my-cool-skill");
  });

  it("replaces special characters", () => {
    expect(slugify("Next.js & React!")).toBe("nextjs-react");
  });

  it("collapses multiple dashes", () => {
    expect(slugify("a---b---c")).toBe("a-b-c");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles unicode", () => {
    expect(slugify("café résumé")).toBe("caf-rsum");
  });
});

describe("skillListingSchema", () => {
  const valid = {
    title: "My Great Skill",
    description: "This is a great skill for doing things",
    price_sats: 1000,
    tags: ["automation", "coding"],
    skill_file_url: "https://example.com/skill.md",
  };

  it("accepts valid input", () => {
    const result = skillListingSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects short title", () => {
    const result = skillListingSchema.safeParse({ ...valid, title: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = skillListingSchema.safeParse({ ...valid, price_sats: -1 });
    expect(result.success).toBe(false);
  });

  it("allows zero price (free)", () => {
    const result = skillListingSchema.safeParse({ ...valid, price_sats: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects too many tags", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      tags: Array(11).fill("tag"),
    });
    expect(result.success).toBe(false);
  });

  it("defaults status to draft", () => {
    const result = skillListingSchema.parse(valid);
    expect(result.status).toBe("draft");
  });

  it("accepts valid category", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      category: "coding",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid category", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      category: "invalid_cat",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid skill_file_url", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      skill_file_url: "https://github.com/user/repo/blob/main/SKILL.md",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid website_url", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      website_url: "https://example.com/my-skill",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid skill_file_url", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      skill_file_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid website_url", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      website_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string for skill_file_url", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      skill_file_url: "",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty string for website_url", () => {
    const result = skillListingSchema.safeParse({
      ...valid,
      website_url: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("skillReviewSchema", () => {
  it("accepts valid review", () => {
    const result = skillReviewSchema.safeParse({ rating: 4, comment: "Great!" });
    expect(result.success).toBe(true);
  });

  it("rejects rating below 1", () => {
    const result = skillReviewSchema.safeParse({ rating: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects rating above 5", () => {
    const result = skillReviewSchema.safeParse({ rating: 6 });
    expect(result.success).toBe(false);
  });

  it("allows empty comment", () => {
    const result = skillReviewSchema.safeParse({ rating: 3, comment: "" });
    expect(result.success).toBe(true);
  });
});
