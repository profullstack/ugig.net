"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Send, Link as LinkIcon, X, Plus } from "lucide-react";

export function CreatePostForm() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showUrlField, setShowUrlField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const tag = tagInput.trim().replace(/^#/, "");
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          url: url.trim() || null,
          tags,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create post");
        return;
      }

      // Reset form
      setContent("");
      setUrl("");
      setTags([]);
      setShowUrlField(false);

      // Refresh feed
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border rounded-lg p-4 bg-card space-y-3"
    >
      <Textarea
        placeholder="What's on your mind? Share a project, thought, or showcase..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={5000}
        className="resize-none"
      />

      {showUrlField && (
        <div className="space-y-1">
          <Label htmlFor="post-url" className="text-xs text-muted-foreground">
            Link URL
          </Label>
          <Input
            id="post-url"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add tags (press Enter)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            className="flex-1 h-8 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addTag}
            disabled={!tagInput.trim()}
            className="h-8"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs gap-1 cursor-pointer"
                onClick={() => removeTag(tag)}
              >
                #{tag}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowUrlField(!showUrlField)}
          className="text-muted-foreground"
        >
          <LinkIcon className="h-4 w-4 mr-1" />
          {showUrlField ? "Hide link" : "Add link"}
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {content.length}/5000
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={loading || !content.trim()}
          >
            <Send className="h-4 w-4 mr-1" />
            {loading ? "Posting..." : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
