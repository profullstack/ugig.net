"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, EyeOff, Trash2, Eye } from "lucide-react";

interface DirectoryOwnerActionsProps {
  listing: {
    id: string;
    title: string;
    url: string;
    description: string | null;
    tags: string[];
    logo_url: string | null;
    banner_url: string | null;
    screenshot_url: string | null;
    status: string;
  };
}

async function responseError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export function DirectoryOwnerActions({ listing }: DirectoryOwnerActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(listing.title);
  const [url, setUrl] = useState(listing.url);
  const [description, setDescription] = useState(listing.description || "");
  const [tagsInput, setTagsInput] = useState((listing.tags || []).join(", "));
  const [logoUrl, setLogoUrl] = useState(listing.logo_url || "");
  const [bannerUrl, setBannerUrl] = useState(listing.banner_url || "");
  const [screenshotUrl, setScreenshotUrl] = useState(listing.screenshot_url || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/directory/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          url,
          description: description || undefined,
          tags,
          logo_url: logoUrl || null,
          banner_url: bannerUrl || null,
          screenshot_url: screenshotUrl || null,
        }),
      });

      if (!res.ok) {
        setError(await responseError(res, "Update failed"));
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError("Update failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleVisibility() {
    setError("");
    setLoading(true);
    try {
      const newStatus = listing.status === "active" ? "hidden" : "active";
      const res = await fetch(`/api/directory/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        setError(await responseError(res, "Visibility update failed"));
        return;
      }

      router.refresh();
    } catch {
      setError("Visibility update failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this listing? This cannot be undone and there is no refund.")) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/directory/${listing.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await responseError(res, "Delete failed"));
        return;
      }

      router.push("/directory");
    } catch {
      setError("Delete failed");
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-6 border-t border-border pt-6">
        <h3 className="font-semibold mb-4">Edit Listing</h3>
        {error && (
          <div role="alert" className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
          </div>
          <div>
            <Label htmlFor="edit-url">URL</Label>
            <Input id="edit-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
          </div>
          <div>
            <Label htmlFor="edit-tags">Tags</Label>
            <Input id="edit-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="comma-separated" />
          </div>
          <div>
            <Label htmlFor="edit-logo">Logo URL</Label>
            <Input id="edit-logo" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-banner">Banner URL</Label>
            <Input id="edit-banner" type="url" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://example.com/banner.png" />
          </div>
          <div>
            <Label htmlFor="edit-screenshot">Homepage Screenshot URL</Label>
            <Input id="edit-screenshot" type="url" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)} placeholder="https://example.com/screenshot.png" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button>
            <Button type="button" variant="outline" onClick={() => { setError(""); setEditing(false); }}>Cancel</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Owner Actions</h3>
      {error && (
        <div role="alert" className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { setError(""); setEditing(true); }}>
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={handleToggleVisibility} disabled={loading}>
          {listing.status === "active" ? (
            <>
              <EyeOff className="h-4 w-4 mr-1" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-1" />
              Show
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={loading}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}
