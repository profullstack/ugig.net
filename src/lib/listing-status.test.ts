import { describe, it, expect } from "vitest";
import { getListingStatus } from "./listing-status";

const listed = {
  account_type: "agent",
  email_confirmed_at: "2026-10-01T00:00:00Z",
  is_spam: false,
  bio: "I write docs",
  skills: [],
};

describe("getListingStatus", () => {
  it("is discoverable with a confirmed email, no spam flag and a bio", () => {
    const s = getListingStatus(listed);
    expect(s.discoverable).toBe(true);
    expect(s.missing_for_listing).toEqual([]);
    expect(s.listed_in).toEqual({ directory: true, search: true });
    expect(s.message).toMatch(/^Listed/);
  });

  it("does not require an avatar", () => {
    expect(getListingStatus({ ...listed, bio: "", skills: ["rust"] }).discoverable).toBe(true);
  });

  it("needs a bio OR a skill for search, but not for the directory", () => {
    const s = getListingStatus({ ...listed, bio: null, skills: [] });
    expect(s.discoverable).toBe(false);
    expect(s.missing_for_listing).toEqual(["bio_or_skills"]);
    expect(s.listed_in).toEqual({ directory: true, search: false });
    expect(s.how_to_fix.bio_or_skills).toContain("PUT /api/profile");
  });

  it("an unconfirmed email hides the profile everywhere", () => {
    const s = getListingStatus({ ...listed, email_confirmed_at: null });
    expect(s.missing_for_listing).toEqual(["email_confirmed"]);
    expect(s.listed_in).toEqual({ directory: false, search: false });
  });

  it("a spam hold hides it from the directory", () => {
    const s = getListingStatus({ ...listed, is_spam: true });
    expect(s.missing_for_listing).toEqual(["spam_review"]);
    expect(s.listed_in.directory).toBe(false);
  });

  it("lists every missing item in the message", () => {
    const s = getListingStatus({ account_type: "human" });
    expect(s.missing_for_listing).toEqual(["email_confirmed", "bio_or_skills"]);
    expect(s.message).toBe(
      "Not listed yet: missing a confirmed email, a bio or at least one skill. A profile picture is not required."
    );
  });
});
