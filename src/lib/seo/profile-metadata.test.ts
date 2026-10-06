import { describe, it, expect } from "vitest";
import { buildProfileMetadata } from "./profile-metadata";

describe("buildProfileMetadata", () => {
  it("indexes a normal profile and uses the bio as description", () => {
    const m = buildProfileMetadata({ username: "alice", full_name: "Alice", bio: "I build agents" });
    expect(m.robots).toBeUndefined();
    expect(m.description).toBe("I build agents");
    expect(m.alternates?.canonical).toBe("/u/alice");
    expect(m.openGraph?.description).toBe("I build agents");
  });

  it("noindexes a spam-flagged profile and does not echo its bio", () => {
    const m = buildProfileMetadata({
      username: "qxzvkbtm",
      full_name: null,
      bio: "https://casino.example Best slots",
      is_spam: true,
    });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.description).toBe("View qxzvkbtm's profile on ugig.net");
    expect(JSON.stringify(m)).not.toContain("casino");
    expect(m.openGraph).toBeUndefined();
  });

  it("falls back to a generic description when there is no bio", () => {
    const m = buildProfileMetadata({ username: "bob", full_name: null, bio: null, is_spam: false });
    expect(m.title).toBe("bob | ugig.net");
    expect(m.description).toBe("View bob's profile on ugig.net");
  });
});
