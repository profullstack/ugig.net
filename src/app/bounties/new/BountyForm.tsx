"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PaymentInput } from "@/components/ui/PaymentInputs";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";

type QuestionType = "short_text" | "long_text" | "multiple_choice";

interface DraftQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options: string[];
}

interface BountyInitialData {
  title?: string;
  description?: string;
  payout_usd?: number;
  payment_coin?: string | null;
  max_submissions?: number | null;
  questions?: Array<{
    id: string;
    type: QuestionType;
    label: string;
    required: boolean;
    options?: string[];
  }>;
}

interface BountyFormProps {
  initialData?: BountyInitialData;
  bountyId?: string;
}

function newQuestion(): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    type: "short_text",
    label: "",
    required: true,
    options: [],
  };
}

export function BountyForm({ initialData, bountyId }: BountyFormProps = {}) {
  const router = useRouter();
  const isEdit = !!bountyId;
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [payout, setPayout] = useState(
    initialData?.payout_usd != null ? String(initialData.payout_usd) : "5"
  );
  const [coin, setCoin] = useState(initialData?.payment_coin ?? "");
  const [maxSubmissions, setMaxSubmissions] = useState(
    initialData?.max_submissions != null ? String(initialData.max_submissions) : ""
  );
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initialData?.questions && initialData.questions.length > 0
      ? initialData.questions.map((q) => ({
          id: q.id,
          type: q.type,
          label: q.label,
          required: q.required,
          options: q.options ?? [],
        }))
      : [
          {
            id: crypto.randomUUID(),
            type: "long_text",
            label: "Share your feedback",
            required: true,
            options: [],
          },
        ]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateQuestion = (id: string, patch: Partial<DraftQuestion>) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError("Title is required");
    if (!description.trim()) return setError("Description is required");
    const payoutNum = parseFloat(payout);
    if (!payoutNum || payoutNum <= 0) return setError("Enter a valid payout amount");
    if (questions.length === 0) return setError("Add at least one question");
    for (const q of questions) {
      if (!q.label.trim()) return setError("Every question needs a label");
      if (q.type === "multiple_choice" && q.options.filter((o) => o.trim()).length < 2) {
        return setError(`Multiple choice "${q.label}" needs at least 2 options`);
      }
    }

    const max = maxSubmissions.trim() ? parseInt(maxSubmissions, 10) : null;
    if (max !== null && (!Number.isFinite(max) || max <= 0)) {
      return setError("Max submissions must be a positive number or blank");
    }

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/bounties/${bountyId}` : "/api/bounties";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          payout_usd: payoutNum,
          payment_coin: coin || null,
          max_submissions: max,
          questions: questions.map((q) => ({
            id: q.id,
            type: q.type,
            label: q.label.trim(),
            required: q.required,
            options:
              q.type === "multiple_choice"
                ? q.options.map((o) => o.trim()).filter(Boolean)
                : undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || (isEdit ? "Failed to save bounty" : "Failed to create bounty"));
        return;
      }
      router.push(`/bounties/${isEdit ? bountyId : json.data.id}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Share product feedback on our new dashboard"
          className="w-full border rounded-md px-3 py-2 bg-background"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this bounty about? Who should submit? What counts as a good answer?"
          rows={4}
          className="w-full border rounded-md px-3 py-2 bg-background resize-y"
          maxLength={10000}
        />
      </div>

      <PaymentInput
        coin={coin}
        onCoinChange={setCoin}
        amount={payout}
        onAmountChange={setPayout}
        amountLabel="Payout per approval (USD)"
        disabled={submitting}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Max submissions <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          type="number"
          value={maxSubmissions}
          onChange={(e) => setMaxSubmissions(e.target.value)}
          placeholder="Leave blank for no cap"
          min="1"
          step="1"
          className="w-full border rounded-md px-3 py-2 bg-background"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium">Submission form</label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add question
          </Button>
        </div>

        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="border border-border rounded-lg p-4 space-y-3 bg-card"
            >
              <div className="flex items-start gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground mt-2 flex-shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      Question {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((qs) => qs.filter((x) => x.id !== q.id))
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={q.label}
                    onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                    placeholder="Question text (shown to submitters)"
                    className="w-full border rounded-md px-3 py-2 bg-background"
                    maxLength={500}
                  />
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <select
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(q.id, {
                          type: e.target.value as QuestionType,
                          options: e.target.value === "multiple_choice" ? ["", ""] : [],
                        })
                      }
                      className="border rounded-md px-2 py-1.5 bg-background"
                    >
                      <option value="short_text">Short text</option>
                      <option value="long_text">Long text</option>
                      <option value="multiple_choice">Multiple choice</option>
                    </select>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) =>
                          updateQuestion(q.id, { required: e.target.checked })
                        }
                      />
                      Required
                    </label>
                  </div>

                  {q.type === "multiple_choice" && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">Options</p>
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              updateQuestion(q.id, {
                                options: q.options.map((o, i) =>
                                  i === optIdx ? e.target.value : o
                                ),
                              })
                            }
                            placeholder={`Option ${optIdx + 1}`}
                            className="flex-1 border rounded-md px-2 py-1.5 bg-background text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(q.id, {
                                options: q.options.filter((_, i) => i !== optIdx),
                              })
                            }
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove option"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateQuestion(q.id, { options: [...q.options, ""] })
                        }
                        className="gap-2"
                      >
                        <Plus className="h-3 w-3" />
                        Add option
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting} className="gap-2">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Save changes" : "Post bounty"}
        </Button>
      </div>
    </div>
  );
}
