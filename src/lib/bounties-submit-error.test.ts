import { describe, it, expect } from "vitest";
import { submitAnswersSchema, formatSubmitAnswersError } from "@/lib/bounties";

/**
 * #535: the accepted submission body had to be brute-forced, because every
 * wrong shape came back as the same shapeless 400.
 */

function errorFor(body: unknown): string {
  const parsed = submitAnswersSchema.safeParse(body);
  if (parsed.success) throw new Error("expected the body to be rejected");
  return formatSubmitAnswersError(parsed.error);
}

describe("formatSubmitAnswersError", () => {
  it("names the expected shape when answers is an object instead of an array", () => {
    const message = errorFor({ answers: { summary: "hello" } });

    expect(message).toContain("answers");
    expect(message).toContain("question_id");
    expect(message).toContain("value");
  });

  it("points at the offending entry when the value field is named answer", () => {
    const message = errorFor({ answers: [{ question_id: "summary", answer: "hello" }] });

    // The path tells you which entry and which field is wrong.
    expect(message).toContain("answers.0.value");
    expect(message).toContain("question_id");
  });

  it("points at the offending entry when question_id is missing", () => {
    const message = errorFor({ answers: [{ value: "hello" }] });

    expect(message).toContain("answers.0.question_id");
  });

  it("still explains the shape when answers is missing entirely", () => {
    const message = errorFor({});

    expect(message).toContain("answers");
    expect(message).toContain("array");
  });

  it("accepts the documented shape, including an array value", () => {
    const parsed = submitAnswersSchema.safeParse({
      answers: [
        { question_id: "summary", value: "a written answer" },
        { question_id: "languages", value: ["TypeScript", "Go"] },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
