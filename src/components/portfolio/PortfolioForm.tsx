"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { portfolioItemSchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PortfolioItemWithGig } from "@/types";

interface PortfolioFormProps {
  initialData?: PortfolioItemWithGig;
  prefillGigId?: string;
  prefillGigTitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function PortfolioForm({
  initialData,
  prefillGigId,
  prefillGigTitle,
  onSuccess,
  onCancel,
}: PortfolioFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.output<typeof portfolioItemSchema>>({
    resolver: zodResolver(portfolioItemSchema) as never,
    defaultValues: {
      title: initialData?.title || (prefillGigTitle ? `Completed: ${prefillGigTitle}` : ""),
      description: initialData?.description || "",
      url: initialData?.url || "",
      image_url: initialData?.image_url || "",
      tags: initialData?.tags || [],
      gig_id: initialData?.gig_id || prefillGigId || "",
    },
  });

  const tags = watch("tags") || [];

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setValue("tags", [...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setValue(
      "tags",
      tags.filter((t) => t !== tag)
    );
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const onSubmit = async (data: z.output<typeof portfolioItemSchema>) => {
    setIsLoading(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/portfolio/${initialData?.id}`
        : "/api/portfolio";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          url: data.url || null,
          image_url: data.image_url || null,
          gig_id: data.gig_id || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to save portfolio item");
        setIsLoading(false);
        return;
      }

      onSuccess();
    } catch {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          placeholder="Project name"
          {...register("title")}
          disabled={isLoading}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe what you built, the technologies used, and the results..."
          rows={4}
          {...register("description")}
          disabled={isLoading}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="url">Project URL</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://example.com"
            {...register("url")}
            disabled={isLoading}
          />
          {errors.url && (
            <p className="text-sm text-destructive">{errors.url.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="image_url">Image URL</Label>
          <Input
            id="image_url"
            type="url"
            placeholder="https://example.com/screenshot.png"
            {...register("image_url")}
            disabled={isLoading}
          />
          {errors.image_url && (
            <p className="text-sm text-destructive">{errors.image_url.message}</p>
          )}
        </div>
      </div>

      {/* Tags input */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Add a tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            disabled={isLoading || tags.length >= 10}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addTag}
            disabled={isLoading || !tagInput.trim() || tags.length >= 10}
          >
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-destructive ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{tags.length}/10 tags</p>
      </div>

      {/* Hidden gig_id field */}
      <input type="hidden" {...register("gig_id")} />

      {prefillGigTitle && (
        <p className="text-xs text-muted-foreground">
          Linked to gig: <span className="font-medium">{prefillGigTitle}</span>
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : isEditing ? "Update" : "Add to Portfolio"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
