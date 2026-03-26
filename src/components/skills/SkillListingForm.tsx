"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SKILL_CATEGORIES, SUPPORTED_AGENT_OPTIONS } from "@/lib/constants";
import { Loader2, Trash2, Link as LinkIcon, Sparkles, Shield, CheckCircle, AlertCircle, Terminal, Copy, Check } from "lucide-react";
import { GenerateScanButton } from "./GenerateScanButton";
import { useDialog } from "@/components/providers/DialogProvider";

interface SkillListingFormProps {
  slug?: string; // If editing
  listingId?: string; // For scan operations
  initialData?: {
    title: string;
    tagline: string;
    description: string;
    price_sats: number;
    category: string;
    tags: string[];
    status: string;
    source_url?: string;
    skill_file_url?: string;
    website_url?: string;
    clawhub_url?: string;
    skill_file_path?: string;
  };
}

export function SkillListingForm({ slug, listingId, initialData }: SkillListingFormProps) {
  const router = useRouter();
  const { confirm } = useDialog();
  const isEdit = !!slug;

  const [title, setTitle] = useState(initialData?.title || "");
  const [tagline, setTagline] = useState(initialData?.tagline || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [priceSats, setPriceSats] = useState(initialData?.price_sats?.toString() || "0");
  const initialTags = initialData?.tags || [];
  const initialSupportedAgents = initialTags.filter((tag) =>
    SUPPORTED_AGENT_OPTIONS.includes(tag as (typeof SUPPORTED_AGENT_OPTIONS)[number])
  );
  const initialGeneralTags = initialTags.filter(
    (tag) => !SUPPORTED_AGENT_OPTIONS.includes(tag as (typeof SUPPORTED_AGENT_OPTIONS)[number])
  );

  const [category, setCategory] = useState(initialData?.category || "");
  const [tagsInput, setTagsInput] = useState(initialGeneralTags.join(", "));
  const [supportedAgentsInput, setSupportedAgentsInput] = useState(initialSupportedAgents.join(", "));
  const [status, setStatus] = useState(initialData?.status || "active");
  const [sourceUrl, setSourceUrl] = useState(initialData?.source_url || "");
  const [skillFileUrl, setSkillFileUrl] = useState(initialData?.skill_file_url || "");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.website_url || "");
  const [clawhubUrl, setClawhubUrl] = useState(initialData?.clawhub_url || "");
  const [skillFilePath] = useState(initialData?.skill_file_path || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [updatingFromUrl, setUpdatingFromUrl] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [publishToClawHub, setPublishToClawHub] = useState(false);
  const [clawhubCommand, setClawhubCommand] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);

  async function handleAutofill() {
    if (!websiteUrl) return;
    setAutofilling(true);
    setError(null);

    try {
      const res = await fetch("/api/skills/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch metadata");
        return;
      }

      const meta = data.metadata;
      if (meta.title && !title) setTitle(meta.title);
      if (meta.description && !description) setDescription(meta.description);
      if (meta.tags?.length && !tagsInput) setTagsInput(meta.tags.join(", "));
    } catch {
      setError("Failed to fetch metadata");
    } finally {
      setAutofilling(false);
    }
  }

  async function handleUpdateFromUrl() {
    if (!isEdit || !slug || !skillFileUrl) return;
    setUpdatingFromUrl(true);
    setError(null);
    setImportStatus(null);

    try {
      const res = await fetch(`/api/skills/${slug}/scan`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update from URL");
        return;
      }

      const status = data.scan?.status || "unknown";
      const hash = data.scan?.content_hash || data.scan?.file_hash;
      setImportStatus({
        success: status === "clean",
        message: `Updated from URL and re-scanned (${status})${hash ? `. Hash: ${String(hash).slice(0, 12)}…` : ""}`,
      });
      router.refresh();
    } catch {
      setError("Failed to update from URL");
    } finally {
      setUpdatingFromUrl(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setImportStatus(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const supportedAgents = supportedAgentsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const combinedTags = Array.from(new Set([...tags, ...supportedAgents]));

    const body: Record<string, unknown> = {
      title,
      tagline,
      description,
      price_sats: parseInt(priceSats) || 0,
      category: category || undefined,
      tags: combinedTags,
      status,
      source_url: sourceUrl || undefined,
      skill_file_url: skillFileUrl || undefined,
      website_url: websiteUrl || undefined,
      clawhub_url: clawhubUrl || undefined,
    };

    try {
      const url = isEdit ? `/api/skills/${slug}` : "/api/skills";
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

      // Show import result feedback
      if (data.import) {
        if (data.import.success) {
          setImportStatus({
            success: true,
            message: `Skill file imported and scanned (${data.import.scan_status}). Hash: ${data.import.content_hash?.slice(0, 12)}…`,
          });
        } else {
          setImportStatus({
            success: false,
            message: `Import failed: ${data.import.error || "Unknown error"}. You can retry via "Generate Security Report".`,
          });
        }
      }

      // If server detected this as an MCP listing, redirect to /mcp/
      if (data.redirect_to) {
        router.push(data.redirect_to);
        router.refresh();
        return;
      }

      const newSlug = data.listing?.slug || slug;

      // Generate ClawHub publish command if requested
      if (publishToClawHub && skillFileUrl) {
        const clawTags = combinedTags.length > 0 ? ` --tags "${combinedTags.join(",")}"` : "";
        const cmd = `clawhub publish . --slug ${newSlug} --name "${title.replace(/"/g, '\\"')}" --version 1.0.0${clawTags}`;
        setClawhubCommand(cmd);
        setLoading(false);
        return; // Don't redirect — show the command first
      }

      // Small delay so user can see import feedback
      if (data.import) {
        await new Promise((r) => setTimeout(r, 1500));
      }
      router.push(`/skills/${newSlug}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function toggleSupportedAgent(agent: string) {
    const current = supportedAgentsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const next = current.includes(agent)
      ? current.filter((item) => item !== agent)
      : [...current, agent];

    setSupportedAgentsInput(next.join(", "));
  }

  async function handleDelete() {
    if (!await confirm("Archive this skill listing? It will be hidden from the marketplace.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/skills/${slug}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/skills");
        router.refresh();
      }
    } catch {
      // ignore
    }
    setDeleting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Skill File URL */}
      <div className="space-y-2">
        <Label htmlFor="skill_file_url">
          <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
          Skill File URL *
        </Label>
        <div className="flex gap-2">
          <Input
            id="skill_file_url"
            type="url"
            value={skillFileUrl}
            onChange={(e) => setSkillFileUrl(e.target.value)}
            placeholder="https://github.com/user/repo/blob/main/SKILL.md"
            className="flex-1"
            required
          />
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUpdateFromUrl}
              disabled={updatingFromUrl || !skillFileUrl}
              className="shrink-0"
            >
              {updatingFromUrl ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LinkIcon className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Update from URL</span>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Direct link to the skill file (e.g. SKILL.md on GitHub, npm package).
          The file will be automatically imported and security-scanned on save.
          <strong className="text-foreground"> A passing security scan is required before the listing can be published.</strong>
        </p>
      </div>

      {/* Website URL + Autofill */}
      <div className="space-y-2">
        <Label htmlFor="website_url">
          <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
          Website URL <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="website_url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com/my-skill"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutofill}
            disabled={autofilling || !websiteUrl}
            className="shrink-0"
          >
            {autofilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Autofill from website</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste a website URL and click Autofill to populate title, description, and tags.
        </p>
      </div>

      {/* ClawHub URL */}
      <div className="space-y-2">
        <Label htmlFor="clawhub_url">
          <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
          ClawHub URL <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="clawhub_url"
          type="url"
          value={clawhubUrl}
          onChange={(e) => setClawhubUrl(e.target.value)}
          placeholder="https://clawhub.ai/your-name/your-skill"
        />
        <p className="text-xs text-muted-foreground">
          Link to your skill&apos;s page on ClawHub. Only add this if your skill is published on ClawHub.
        </p>
      </div>

      {/* Legacy Source URL (hidden if empty, kept for backward compat) */}
      {sourceUrl && (
        <div className="space-y-2">
          <Label htmlFor="source_url">
            <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
            Source URL <span className="text-muted-foreground font-normal">(legacy)</span>
          </Label>
          <Input
            id="source_url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://github.com/user/skill-repo"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. GitHub PR Reviewer Agent"
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
          placeholder="A brief one-liner about what this skill does"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this skill does, how to use it, requirements..."
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
            {SKILL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
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
          placeholder="e.g. github, code-review, automation (comma separated)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="supported-agents">Supported agents</Label>
        <Input
          id="supported-agents"
          value={supportedAgentsInput}
          onChange={(e) => setSupportedAgentsInput(e.target.value)}
          placeholder="e.g. claude-code, openclaw, codex"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {SUPPORTED_AGENT_OPTIONS.map((agent) => {
            const isSelected = supportedAgentsInput
              .split(",")
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean)
              .includes(agent);

            return (
              <button
                key={agent}
                type="button"
                onClick={() => toggleSupportedAgent(agent)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {agent}
              </button>
            );
          })}
        </div>
      </div>

      {/* Imported file status */}
      {skillFilePath && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-xs text-green-500 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Imported file: {skillFilePath.split("/").pop()}
          </p>
        </div>
      )}

      {/* Security Scan */}
      {isEdit && slug && (
        <div className="space-y-2">
          <Label>
            <Shield className="h-3.5 w-3.5 inline mr-1" />
            Security Scan
          </Label>
          {(skillFilePath || skillFileUrl) && (
            <p className="text-xs text-muted-foreground mb-1">
              Scans run automatically when you save. Use the button below to re-scan manually.
            </p>
          )}
          <GenerateScanButton
            slug={slug}
            hasScannable={!!skillFilePath || !!skillFileUrl}
          />
          {!skillFilePath && !skillFileUrl && (
            <p className="text-xs text-muted-foreground">
              Set a Skill File URL to enable security scanning and file import.
            </p>
          )}
        </div>
      )}

      {isEdit && (
        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="draft"
                checked={status === "draft"}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className="text-sm">Draft</span>
            </label>
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
          </div>
          {skillFileUrl && status === "active" && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Publishing requires a passing security scan. The scan runs automatically when you save.
            </p>
          )}
        </div>
      )}

      {/* Import status feedback */}
      {importStatus && (
        <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
          importStatus.success
            ? "bg-green-500/10 border-green-500/20 text-green-500"
            : "bg-amber-500/10 border-amber-500/20 text-amber-500"
        }`}>
          {importStatus.success ? (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          {importStatus.message}
        </div>
      )}

      {/* ClawHub publish option */}
      {skillFileUrl && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={publishToClawHub}
              onChange={(e) => setPublishToClawHub(e.target.checked)}
              className="rounded border-border"
            />
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm">Also publish to ClawHub</span>
          </label>
          <p className="text-xs text-muted-foreground ml-6">
            After saving, we&apos;ll generate a <code className="bg-muted px-1 py-0.5 rounded text-xs">clawhub publish</code> command you can run to list this skill on <a href="https://clawhub.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">clawhub.com</a> (requires <code className="bg-muted px-1 py-0.5 rounded text-xs">clawhub login</code>).
          </p>
        </div>
      )}

      {/* ClawHub command display */}
      {clawhubCommand && (
        <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" />
            Skill saved! Run this to publish to ClawHub:
          </div>
          <div className="relative">
            <pre className="bg-background border border-border rounded-md p-3 text-xs overflow-x-auto font-mono">
              {clawhubCommand}
            </pre>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(clawhubCommand);
                setCopiedCommand(true);
                setTimeout(() => setCopiedCommand(false), 2000);
              }}
              className="absolute top-2 right-2 p-1.5 bg-background border border-border rounded-md hover:bg-muted transition-colors"
            >
              {copiedCommand ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Run from your skill&apos;s directory. Need ClawHub CLI? <code className="bg-muted px-1 py-0.5 rounded">npm i -g clawhub</code>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const newSlug = clawhubCommand.match(/--slug (\S+)/)?.[1] || slug;
              router.push(`/skills/${newSlug}`);
              router.refresh();
            }}
          >
            Continue to listing →
          </Button>
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
