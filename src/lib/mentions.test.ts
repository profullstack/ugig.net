import { describe, it, expect } from "vitest";
import { parseMentions, parseContentWithMentions } from "./mentions";

describe("parseMentions", () => {
  it("extracts single mention", () => {
    expect(parseMentions("hey @alice check this")).toEqual(["alice"]);
  });

  it("extracts multiple mentions", () => {
    const result = parseMentions("@alice and @bob should see this");
    expect(result).toContain("alice");
    expect(result).toContain("bob");
    expect(result).toHaveLength(2);
  });

  it("deduplicates mentions", () => {
    expect(parseMentions("@alice hey @alice")).toEqual(["alice"]);
  });

  it("lowercases usernames", () => {
    expect(parseMentions("@Alice")).toEqual(["alice"]);
  });

  it("returns empty for no mentions", () => {
    expect(parseMentions("no mentions here")).toEqual([]);
  });

  it("handles mention at start of string", () => {
    expect(parseMentions("@alice hello")).toEqual(["alice"]);
  });

  it("handles mention with hyphens and underscores", () => {
    expect(parseMentions("@user-name_123")).toEqual(["user-name_123"]);
  });
});

describe("parseContentWithMentions", () => {
  it("parses text with mentions into segments", () => {
    const segments = parseContentWithMentions("hey @alice check this");
    expect(segments).toEqual([
      { type: "text", value: "hey " },
      { type: "mention", username: "alice" },
      { type: "text", value: " check this" },
    ]);
  });

  it("handles text with no mentions", () => {
    const segments = parseContentWithMentions("no mentions");
    expect(segments).toEqual([{ type: "text", value: "no mentions" }]);
  });

  it("handles mention at start", () => {
    const segments = parseContentWithMentions("@alice hello");
    expect(segments).toEqual([
      { type: "mention", username: "alice" },
      { type: "text", value: " hello" },
    ]);
  });
});
