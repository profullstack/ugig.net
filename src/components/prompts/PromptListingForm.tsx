"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROMPT_CATEGORIES, PROMPT_MODEL_OPTIONS } from "@/lib/constants";
import { Loader2, Trash2 } from "lucide-react";
import { useDialog } from "@/components/providers/DialogProvider";

interface PromptListingFormProps {
  slug?: string;
  initialData?: {
    title: string;
    tagline: string;
    description: string;
    price_sats: number;
    category: string;
    tags: string[];
    status: string;
    prompt_text: string;
    model_compatibility: string[];
    example_output: string;
    use_case: string;
  };
}

export function PromptListingForm({ slug, initialData }: PromptListingFormProps) {
  const router = useRouter();
  const { confirm } = useDialog();
  const isEdit = !!slug;

  const [title, setTitle] = useState(initialData?.title || "");
  const [tagline, setTagline] = useState(initialData?.tagline || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [priceSats, setPriceSats] = useState(initialData?.price_sats?.toString() || "0");
  const [category, setCategory] = useState(initialData?.category || "");
  const [tagsInput, setTagsInput] = useState((initialData?.tags || []).join(", "));
  const [status, setStatus] = useState(initialData?.status || "active");
  const [promptText, setPromptText] = useState(initialData?.prompt_text || "");
  const [modelCompatibility, setModelCompatibility] = useState<string[]>(
    initialData?.model_compatibility || []
  );
  const [exampleOutput, setExampleOutput] = useState(initialData?.example_output || "");
  const [useCase, setUseCase] = useState(initialData?.use_case || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function toggleModel(model: string) {
    setModelCompatibility((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      title,
      tagline,
      description,
      price_sats: parseInt(priceSats) || 0,
      category: category || undefined,
      tags,
      status,
      prompt_text: promptText,
      model_compatibility: modelCompatibility,
      example_output: exampleOutput || undefined,
      use_case: useCase || undefined,
    };

    try {
      const url = isEdit ? `/api/prompts/${slug}` : "/api/prompts";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }

      const newSlug = data.listing?.slug || slug;
      router.push(`/prompts/${newSlug}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!await confirm("Archive this prompt listing? It will be hidden from the marketplace.")) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/prompts/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to archive prompt listing");
        return;
      }

      router.push("/dashboard/prompts");
      router.refresh();
    } catch {
      setError("Failed to archive prompt listing");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Prompt Text */}
      <div className="space-y-2">
        <Label htmlFor="prompt_text">Prompt Text *</Label>
        <textarea
          id="prompt_text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Enter your prompt here. This is the main asset being sold..."
          rows={12}
          required
          maxLength={50000}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
        />
        <p className="text-xs text-muted-foreground">
          The full prompt content. {promptText.length}/50000 characters.
        </p>
      </div>

      {/* Model Compatibility */}
      <div className="space-y-2">
        <Label>Model Compatibility</Label>
        <div className="flex flex-wrap gap-2">
          {PROMPT_MODEL_OPTIONS.map((model) => (
            <button
              key={model}
              type="button"
              onClick={() => toggleModel(model)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                modelCompatibility.includes(model)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {model}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Select which AI models this prompt works best with.
        </p>
      </div>

      {/* Use Case */}
      <div className="space-y-2">
        <Label htmlFor="use_case">Use Case</Label>
        <Input
          id="use_case"
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          placeholder="e.g. Generate SEO-optimized blog post outlines"
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          Brief description of what this prompt is for.
        </p>
      </div>

      {/* Example Output */}
      <div className="space-y-2">
        <Label htmlFor="example_output">
          Example Output <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id="example_output"
          value={exampleOutput}
          onChange={(e) => setExampleOutput(e.target.value)}
          placeholder="Paste a sample of what this prompt produces..."
          rows={6}
          maxLength={10000}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Ultimate Code Review Prompt"
          required
          minLength={3}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tagline">Tagline</Label>
        <Input
          id="tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="A brief one-liner about what this prompt does"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this prompt does, how to use it, what results to expect..."
          rows={8}
          required
          minLength={10}
          maxLength={10000}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price (sats)</Label>
          <Input
            id="price"
            type="number"
            min="0"
            value={priceSats}
            onChange={(e) => setPriceSats(e.target.value)}
            placeholder="0 = free"
          />
          <p className="text-xs text-muted-foreground">0 for free listing</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Select category</option>
            {PROMPT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1).replace("-", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. seo, blog, content (comma separated)"
        />
      </div>

      {isEdit && (
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="active"
                checked={status === "active"}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className="text-sm">Active (visible on marketplace)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="archived"
                checked={status === "archived"}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className="text-sm">Archived</span>
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Save Changes" : "Create Listing"}
        </Button>

        {isEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-500 hover:text-red-600"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Archive
          </Button>
        )}
      </div>
    </form>
  );
}
