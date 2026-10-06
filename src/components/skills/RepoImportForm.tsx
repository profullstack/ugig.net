"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SKILL_CATEGORIES, SKILL_FEE_RATES } from "@/lib/constants";
import { SellerFeeNotice } from "@/components/marketplace/FeeNotices";
import {
  Loader2,
  Github,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  XCircle,
  Package,
  ExternalLink,
  Zap,
} from "lucide-react";
import type { RepoSkillPreview } from "@/lib/skills/repo-import";

type Step = "url" | "preview" | "importing" | "done";

interface SkillRow extends RepoSkillPreview {
  selected: boolean;
  price_sats: number;
}

interface ImportResult {
  dirName: string;
  title: string;
  slug: string | null;
  status: string;
  scanStatus?: string;
  error: string | null;
}

export function RepoImportForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("url");
  const [repoUrl, setRepoUrl] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [globalPrice, setGlobalPrice] = useState("0");
  const [globalCategory, setGlobalCategory] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);

  async function handleDiscover() {
    if (!repoUrl.trim()) return;
    setDiscovering(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/skills/import-repo?repo_url=${encodeURIComponent(repoUrl.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to discover skills");
        return;
      }

      if (!data.skills?.length) {
        setError("No skills found at that URL. Make sure it points to a directory of skill subdirectories.");
        return;
      }

      setSkills(
        data.skills.map((s: RepoSkillPreview) => ({
          ...s,
          selected: true,
          price_sats: 0,
        }))
      );
      setTruncated(data.truncated ?? false);
      setStep("preview");
    } catch {
      setError("Failed to connect to GitHub. Check the URL and try again.");
    } finally {
      setDiscovering(false);
    }
  }

  function toggleSelect(dirName: string) {
    setSkills((prev) =>
      prev.map((s) => (s.dirName === dirName ? { ...s, selected: !s.selected } : s))
    );
  }

  function toggleAll() {
    const allSelected = skills.every((s) => s.selected);
    setSkills((prev) => prev.map((s) => ({ ...s, selected: !allSelected })));
  }




  async function handleImport() {
    const selected = skills.filter((s) => s.selected);
    if (selected.length === 0) return;

    setStep("importing");
    setError(null);

    const price = Math.max(0, parseInt(globalPrice) || 0);
    const payload = selected.map((s) => ({
      ...s,
      price_sats: price,
      category: globalCategory || undefined,
    }));

    try {
      const res = await fetch("/api/skills/import-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: payload }),
      });

      const data = await res.json();

      if (!res.ok && !data.results) {
        setError(data.error || "Import failed");
        setStep("preview");
        return;
      }

      setResults(data.results || []);
      setStep("done");
      router.refresh();
    } catch {
      setError("Something went wrong during import");
      setStep("preview");
    }
  }

  const selectedCount = skills.filter((s) => s.selected).length;

  // ── Step: Enter URL ─────────────────────────────────────────────
  if (step === "url") {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-xl font-semibold mb-1">Import from GitHub Repo</h2>
          <p className="text-sm text-muted-foreground">
            Paste a GitHub URL pointing to a directory of skill subdirectories.
            Each subdirectory should contain a <code className="bg-muted px-1 py-0.5 rounded text-xs">SKILL.md</code> or{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">README.md</code>.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="repo_url">
            <Github className="h-3.5 w-3.5 inline mr-1" />
            Repository URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="repo_url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/cloudflare/skills/tree/main/skills"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
            />
            <Button
              type="button"
              onClick={handleDiscover}
              disabled={discovering || !repoUrl.trim()}
            >
              {discovering ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              Discover
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Example:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">
              https://github.com/cloudflare/skills/tree/main/skills
            </code>
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── Step: Preview / Select ───────────────────────────────────────
  if (step === "preview") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {skills.length} skill{skills.length !== 1 ? "s" : ""} found
            </h2>
            <p className="text-sm text-muted-foreground">
              Select which skills to import. Set a price and category to apply to all of them.
            </p>
            {truncated && (
              <p className="text-xs text-amber-500 mt-1">
                Repo has more than 50 directories — only the first 50 are shown.
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setStep("url")}>
            ← Back
          </Button>
        </div>

        {/* Global settings */}
        <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Applied to all imported skills
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-500" />
                Price (sats)
              </Label>
              <Input
                type="number"
                min="0"
                value={globalPrice}
                onChange={(e) => setGlobalPrice(e.target.value)}
                className="w-36 h-8 text-sm"
                placeholder="0 = free"
              />
            </div>
            <div className="basis-full">
              <SellerFeeNotice priceSats={Math.max(0, parseInt(globalPrice) || 0)} rates={SKILL_FEE_RATES} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <select
                value={globalCategory}
                onChange={(e) => setGlobalCategory(e.target.value)}
                className="h-8 px-2 border border-border rounded-md bg-background text-sm"
              >
                <option value="">None</option>
                {SKILL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Skill list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
            >
              {skills.every((s) => s.selected) ? "Deselect all" : "Select all"}
            </button>
            <span className="text-xs text-muted-foreground">
              {selectedCount} of {skills.length} selected
            </span>
          </div>

          {skills.map((skill) => (
            <div
              key={skill.dirName}
              className={`flex items-start gap-3 p-4 border rounded-lg transition-colors cursor-pointer ${
                skill.selected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card opacity-60"
              }`}
              onClick={() => toggleSelect(skill.dirName)}
            >
              <input
                type="checkbox"
                checked={skill.selected}
                onChange={() => toggleSelect(skill.dirName)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{skill.title}</span>
                  {skill.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {skill.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {skill.tagline && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {skill.tagline}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <a
                    href={skill.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    {skill.dirName}
                  </a>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-500" />
                    {skill.price_sats === 0 ? "Free" : `${skill.price_sats.toLocaleString()} sats`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <Button onClick={handleImport} disabled={selectedCount === 0}>
          Import {selectedCount} skill{selectedCount !== 1 ? "s" : ""}
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  // ── Step: Importing (spinner) ────────────────────────────────────
  if (step === "importing") {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">
          Importing skills and running security scans…
        </p>
        <p className="text-xs text-muted-foreground">This may take a moment.</p>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────────────────
  const successCount = results.filter((r) => r.error === null).length;
  const errorCount = results.filter((r) => r.error !== null).length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Import complete</h2>
        <p className="text-sm text-muted-foreground">
          {successCount} skill{successCount !== 1 ? "s" : ""} imported successfully
          {errorCount > 0 && `, ${errorCount} failed`}.
        </p>
      </div>

      <div className="space-y-2">
        {results.map((r) => (
          <div
            key={r.dirName}
            className={`flex items-start gap-3 p-3 border rounded-lg ${
              r.error
                ? "border-red-500/20 bg-red-500/5"
                : r.status === "draft"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-green-500/20 bg-green-500/5"
            }`}
          >
            {r.error ? (
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            ) : r.status === "draft" ? (
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{r.title}</p>
              {r.error ? (
                <p className="text-xs text-red-500">{r.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {r.status === "draft"
                    ? "Saved as draft — security scan flagged issues"
                    : `Active · scan: ${r.scanStatus || "pending"}`}
                </p>
              )}
            </div>
            {r.slug && !r.error && (
              <a
                href={`/skills/${r.slug}`}
                className="text-xs text-primary hover:underline shrink-0"
              >
                View →
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button onClick={() => router.push("/dashboard/skills")}>
          <Package className="h-4 w-4 mr-2" />
          My Skills
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setStep("url");
            setSkills([]);
            setResults([]);
            setRepoUrl("");
            setError(null);
          }}
        >
          Import another repo
        </Button>
      </div>
    </div>
  );
}
