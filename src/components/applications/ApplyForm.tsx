"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AI_TOOLS } from "@/types";

interface ApplyFormProps {
  gigId: string;
  gigTitle: string;
  budgetType: "fixed" | "hourly" | "daily" | "weekly" | "monthly" | "per_task" | "per_unit" | "revenue_share";
  budgetMin: number | null;
  budgetMax: number | null;
  budgetUnit?: string | null;
  paymentCoin?: string | null;
  aiToolsPreferred: string[];
}

export function ApplyForm({
  gigId,
  gigTitle,
  budgetType,
  budgetMin,
  budgetMax,
  budgetUnit,
  paymentCoin,
  aiToolsPreferred,
}: ApplyFormProps) {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [coverLetter, setCoverLetter] = useState("");
  const [proposedRate, setProposedRate] = useState("");
  const [proposedTimeline, setProposedTimeline] = useState("");
  const [portfolioItems, setPortfolioItems] = useState<string[]>([]);
  const [newPortfolioUrl, setNewPortfolioUrl] = useState("");
  const [aiToolsToUse, setAiToolsToUse] = useState<string[]>(aiToolsPreferred);

  const addPortfolioItem = () => {
    if (newPortfolioUrl && portfolioItems.length < 5) {
      try {
        new URL(newPortfolioUrl);
        setPortfolioItems([...portfolioItems, newPortfolioUrl]);
        setNewPortfolioUrl("");
        setError(null);
      } catch {
        setError("Please enter a valid URL");
      }
    }
  };

  const removePortfolioItem = (index: number) => {
    setPortfolioItems(portfolioItems.filter((_, i) => i !== index));
  };

  const toggleAiTool = (tool: string) => {
    if (aiToolsToUse.includes(tool)) {
      setAiToolsToUse(aiToolsToUse.filter((t) => t !== tool));
    } else if (aiToolsToUse.length < 10) {
      setAiToolsToUse([...aiToolsToUse, tool]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: gigId,
          cover_letter: coverLetter,
          proposed_rate: proposedRate ? parseFloat(proposedRate) : null,
          proposed_timeline: proposedTimeline || null,
          portfolio_items: portfolioItems,
          ai_tools_to_use: aiToolsToUse,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit application");
      }

      router.push(`/gigs/${gigId}?applied=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Apply to Gig</h1>
      <p className="text-muted-foreground mb-8">{gigTitle}</p>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cover Letter */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Cover Letter <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            placeholder="Introduce yourself and explain why you're a great fit for this gig..."
            rows={8}
            required
            minLength={50}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {coverLetter.length}/2000 characters (minimum 50)
          </p>
        </div>

        {/* Proposed Rate */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Proposed Rate (
            {budgetType === "hourly" ? "$/hr" :
             budgetType === "per_task" ? `$/${budgetUnit || "task"}` :
             budgetType === "per_unit" ? `$/${budgetUnit || "unit"}` :
             budgetType === "revenue_share" ? "% revenue share" :
             "$ fixed"})
          </label>
          <Input
            type="number"
            value={proposedRate}
            onChange={(e) => setProposedRate(e.target.value)}
            placeholder={
              budgetMin && budgetMax
                ? budgetType === "revenue_share"
                  ? `Gig range: ${budgetMin}% - ${budgetMax}%`
                  : `Gig budget: $${budgetMin} - $${budgetMax}`
                : "Enter your proposed rate"
            }
            min={0}
            step={0.01}
          />
          {paymentCoin && (
            <p className="text-xs text-muted-foreground mt-1">
              💰 This gig pays in <strong>{paymentCoin}</strong>
            </p>
          )}
        </div>

        {/* Timeline */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Proposed Timeline
          </label>
          <Input
            value={proposedTimeline}
            onChange={(e) => setProposedTimeline(e.target.value)}
            placeholder="e.g., 2 weeks, 1 month, ongoing"
            maxLength={200}
          />
        </div>

        {/* Portfolio Items */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Portfolio Links (up to 5)
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              value={newPortfolioUrl}
              onChange={(e) => setNewPortfolioUrl(e.target.value)}
              placeholder="https://example.com/your-work"
              type="url"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addPortfolioItem}
              disabled={portfolioItems.length >= 5}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {portfolioItems.length > 0 && (
            <div className="space-y-2">
              {portfolioItems.map((url, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded"
                >
                  <span className="flex-1 truncate text-sm">{url}</span>
                  <button
                    type="button"
                    onClick={() => removePortfolioItem(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Tools */}
        <div>
          <label className="block text-sm font-medium mb-2">
            AI Tools You&apos;ll Use
          </label>
          <div className="flex flex-wrap gap-2">
            {AI_TOOLS.map((tool) => (
              <Badge
                key={tool}
                variant={aiToolsToUse.includes(tool) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleAiTool(tool)}
              >
                {tool}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Click to select the AI tools you plan to use for this gig
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <Button
            type="submit"
            disabled={submitting || coverLetter.length < 50}
            className="flex-1"
          >
            {submitting ? (
              "Submitting..."
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Application
              </>
            )}
          </Button>
          <Link href={`/gigs/${gigId}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
