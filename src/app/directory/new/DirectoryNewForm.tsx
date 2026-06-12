"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, ArrowLeft, Loader2, Globe, Pencil } from "lucide-react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

interface FetchedMeta {
  title: string;
  description: string;
  logo_url: string;
  banner_url: string;
  screenshot_url: string;
  tags: string[];
}

export function DirectoryNewForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login?redirect=/directory/new");
          return;
        }
      } catch {
        // If the auth check fails (network/Supabase hiccup), don't trap the
        // user on a "Loading..." screen — let the form render. Auth is
        // re-enforced server-side when the listing is submitted.
      } finally {
        setCheckingAuth(false);
      }

      try {
        const res = await fetch("/api/wallet/balance");
        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance_sats ?? data.balance ?? null);
        }
      } catch {
        // balance display is optional
      }
    }
    init();
  }, [router]);

  async function handleFetchMeta() {
    if (!url) return;
    setError("");
    setFetching(true);

    try {
      const res = await fetch("/api/directory/fetch-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch site info");
        setFetching(false);
        return;
      }

      const meta: FetchedMeta = data;
      setTitle(meta.title || "");
      setDescription(meta.description || "");
      setLogoUrl(meta.logo_url || "");
      setBannerUrl(meta.banner_url || "");
      setScreenshotUrl(meta.screenshot_url || "");
      setTagsInput((meta.tags || []).join(", "));
      setFetched(true);
      setEditing(false);
    } catch {
      setError("Failed to fetch site info. You can fill in details manually.");
      setFetched(true);
      setEditing(true);
    } finally {
      setFetching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const body: Record<string, any> = { title: title || url, url };
      if (description) body.description = description;
      if (tags.length > 0) body.tags = tags;
      if (logoUrl) body.logo_url = logoUrl;
      if (bannerUrl) body.banner_url = bannerUrl;
      if (screenshotUrl) body.screenshot_url = screenshotUrl;

      const res = await fetch("/api/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create listing");
        setLoading(false);
        return;
      }

      router.push("/directory?success=1");
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="max-w-lg mx-auto text-center text-muted-foreground py-12">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href="/directory"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Directory
      </Link>

      <h1 className="text-3xl font-bold mb-2">List Your Project</h1>
      <p className="text-muted-foreground mb-6">
        Paste your URL and we&apos;ll fetch the details. 50 ⚡ sats for 1 year.
      </p>

      {balance !== null && (
        <div className="flex items-center gap-2 mb-6 p-3 bg-muted/30 rounded-lg text-sm">
          <Zap className="h-4 w-4 text-amber-500" />
          <span>
            Wallet balance: <strong>{balance.toLocaleString()} sats</strong>
          </span>
          {balance < 50 && (
            <span className="text-destructive ml-auto">
              Need at least 50 sats
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: URL input */}
      {!fetched && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="url">Project URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-project.com"
                required
                disabled={fetching}
              />
              <Button
                type="button"
                onClick={handleFetchMeta}
                disabled={!url || fetching}
              >
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <span className="ml-1">{fetching ? "Fetching..." : "Fetch"}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              We&apos;ll auto-fill title, description, logo, and tags from your site.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Preview + Edit + Submit */}
      {fetched && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Preview card */}
          {!editing && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover bg-muted flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">
                    {title || url}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate">{url}</p>
                </div>
              </div>

              {description && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {description}
                </p>
              )}

              {tagsInput && (
                <div className="flex flex-wrap gap-1.5">
                  {tagsInput
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              )}

              {/* Banner preview */}
              {bannerUrl && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">Banner</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bannerUrl}
                    alt="Banner"
                    className="w-full h-32 object-cover rounded-lg border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* Screenshot preview */}
              {screenshotUrl && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">Homepage Preview</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl}
                    alt="Homepage screenshot"
                    className="w-full h-40 object-cover object-top rounded-lg border border-border shadow-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFetched(false);
                    setTitle("");
                    setDescription("");
                    setTagsInput("");
                    setLogoUrl("");
                    setBannerUrl("");
                    setScreenshotUrl("");
                  }}
                >
                  Change URL
                </Button>
              </div>
            </div>
          )}

          {/* Edit fields */}
          {editing && (
            <div className="space-y-4 border border-border rounded-lg p-4">
              <div>
                <Label htmlFor="title">Project Name</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Awesome Project"
                  maxLength={100}
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description (max 500 chars)"
                  maxLength={500}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {description.length}/500
                </p>
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="bitcoin, saas, open-source"
                />
              </div>

              <div>
                <Label htmlFor="logo_url">Logo URL</Label>
                <Input
                  id="logo_url"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Done Editing
              </Button>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !url}
          >
            {loading ? (
              "Processing..."
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Pay 50 ⚡ & List
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
