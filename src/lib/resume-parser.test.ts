import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resume-parser module", () => {
  it("can be imported without an OpenAI API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(import("./resume-parser")).resolves.toHaveProperty(
      "parseResumeFile"
    );
  });
});
