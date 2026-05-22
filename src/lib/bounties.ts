import { z } from "zod";

export const questionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(["short_text", "long_text", "multiple_choice"]),
  label: z.string().min(1).max(500),
  required: z.boolean().default(true),
  options: z.array(z.string().min(1).max(200)).optional(),
});

export const createBountySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  payout_usd: z.number().positive().max(100000),
  payout_currency: z.string().default("USD"),
  payment_coin: z.string().max(16).nullable().optional(),
  max_submissions: z.number().int().positive().max(100000).nullable().optional(),
  closes_at: z.string().datetime().optional(),
  questions: z.array(questionSchema).min(1).max(20),
});

export const updateBountySchema = createBountySchema.partial().extend({
  status: z.enum(["open", "paused", "closed"]).optional(),
});

export const answerSchema = z.object({
  question_id: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});

export const submitAnswersSchema = z.object({
  answers: z.array(answerSchema),
});

export const reviewSubmissionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  review_notes: z.string().max(2000).optional(),
});

export type BountyQuestion = z.infer<typeof questionSchema>;
export type BountyAnswer = z.infer<typeof answerSchema>;

export function validateAnswers(
  questions: BountyQuestion[],
  answers: BountyAnswer[]
): string | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answeredIds = new Set(answers.map((a) => a.question_id));

  // Required questions must have an answer with non-empty value
  for (const q of questions) {
    if (!q.required) continue;
    const a = answers.find((x) => x.question_id === q.id);
    if (!a) return `Missing answer for required question: ${q.label}`;
    if (typeof a.value === "string" && a.value.trim() === "") {
      return `Required answer cannot be empty: ${q.label}`;
    }
    if (Array.isArray(a.value) && a.value.length === 0) {
      return `Required answer cannot be empty: ${q.label}`;
    }
  }

  // Each answer must reference a real question, with matching type
  for (const a of answers) {
    const q = byId.get(a.question_id);
    if (!q) return `Unknown question id: ${a.question_id}`;
    if (q.type === "multiple_choice") {
      const options = q.options || [];
      const values = Array.isArray(a.value) ? a.value : [a.value];
      for (const v of values) {
        if (!options.includes(v)) {
          return `Invalid option for "${q.label}": ${v}`;
        }
      }
    } else if (typeof a.value !== "string") {
      return `Answer for "${q.label}" must be a string`;
    }
  }

  // Stray answers for unknown questions are caught above; check missing
  void answeredIds;
  return null;
}
