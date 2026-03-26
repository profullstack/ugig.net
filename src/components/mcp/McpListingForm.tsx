"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MCP_CATEGORIES, MCP_TRANSPORT_TYPES } from "@/lib/constants";
import { Loader2, Trash2, Link as LinkIcon, Server } from "lucide-react";
import { useDialog } from "@/components/providers/DialogProvider";

interface McpListingFormProps {
  slug?: string;
  initialData?: {
    title: string;
    tagline: string;
    description: string;
    price_sats: number;
    category: string;
    tags: string[];
    status: string;
    mcp_server_url?: string;
    source_url?: string;
    transport_type?: string;
    supported_tools?: string[];
  };
}

export function McpListingForm({ slug, initialData }: McpListingFormProps) {
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
  const [mcpServerUrl, setMcpServerUrl] = useState(initialData?.mcp_server_url || "");
  const [sourceUrl, setSourceUrl] = useState(initialData?.source_url || "");
  const [transportType, setTransportType] = useState(initialData?.transport_type || "");
  const [supportedToolsInput, setSupportedToolsInput] = useState(
    (initialData?.supported_tools || []).join(", ")
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const supportedTools = supportedToolsInput
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
      mcp_server_url: mcpServerUrl || undefined,
      source_url: sourceUrl || undefined,
      transport_type: transportType || undefined,
      supported_tools: supportedTools,
    };

    try {
      const url = isEdit ? `/api/mcp/${slug}` : "/api/mcp";
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
      router.push(`/mcp/${newSlug}`);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!await confirm("Archive this MCP server listing? It will be hidden from the marketplace.")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/mcp/${slug}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/mcp");
        router.refresh();
      }
    } catch {
      // ignore
    }
    setDeleting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* MCP Server URL */}
      <div className="space-y-2">
        <Label htmlFor="mcp_server_url">
          <Server className="h-3.5 w-3.5 inline mr-1" />
          MCP Server URL
        </Label>
        <Input
          id="mcp_server_url"
          type="url"
          value={mcpServerUrl}
          onChange={(e) => setMcpServerUrl(e.target.value)}
          placeholder="https://your-mcp-server.example.com/mcp"
        />
        <p className="text-xs text-muted-foreground">
          The endpoint URL where this MCP server can be reached.
        </p>
      </div>

      {/* Source URL */}
      <div className="space-y-2">
        <Label htmlFor="source_url">
          <LinkIcon className="h-3.5 w-3.5 inline mr-1" />
          Source Code URL <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="source_url"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://github.com/user/mcp-server-repo"
        />
      </div>

      {/* Transport Type */}
      <div className="space-y-2">
        <Label htmlFor="transport_type">Transport Type</Label>
        <select
          id="transport_type"
          value={transportType}
          onChange={(e) => setTransportType(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Select transport</option>
          {MCP_TRANSPORT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Supported Tools */}
      <div className="space-y-2">
        <Label htmlFor="supported_tools">Supported Tools</Label>
        <Input
          id="supported_tools"
          value={supportedToolsInput}
          onChange={(e) => setSupportedToolsInput(e.target.value)}
          placeholder="e.g. read_file, search, execute_code (comma separated)"
        />
        <p className="text-xs text-muted-foreground">
          List the tools/capabilities this MCP server provides.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. GitHub MCP Server"
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
          placeholder="A brief one-liner about what this MCP server does"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this MCP server does, what tools it provides, how to connect..."
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
            {MCP_CATEGORIES.map((cat) => (
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
          placeholder="e.g. github, api, code-review (comma separated)"
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
