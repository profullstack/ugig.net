"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workHistorySchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkHistory } from "@/types";

interface WorkHistoryFormProps {
  initialData?: WorkHistory;
  onSuccess: () => void;
  onCancel: () => void;
}

export function WorkHistoryForm({
  initialData,
  onSuccess,
  onCancel,
}: WorkHistoryFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.output<typeof workHistorySchema>>({
    // Type assertion needed due to zod input/output type mismatch with react-hook-form
    resolver: zodResolver(workHistorySchema) as never,
    defaultValues: {
      company: initialData?.company || "",
      position: initialData?.position || "",
      description: initialData?.description || "",
      start_date: initialData?.start_date || "",
      end_date: initialData?.end_date || "",
      is_current: initialData?.is_current || false,
      location: initialData?.location || "",
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch() is safe here
  const isCurrent = watch("is_current");

  const onSubmit = async (data: z.output<typeof workHistorySchema>) => {
    setIsLoading(true);
    setError(null);

    try {
      const url = isEditing
        ? `/api/work-history/${initialData?.id}`
        : "/api/work-history";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          end_date: data.is_current ? null : data.end_date,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to save work history");
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

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="company">Company *</Label>
          <Input
            id="company"
            placeholder="Company name"
            {...register("company")}
            disabled={isLoading}
          />
          {errors.company && (
            <p className="text-sm text-destructive">{errors.company.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="position">Position *</Label>
          <Input
            id="position"
            placeholder="Job title"
            {...register("position")}
            disabled={isLoading}
          />
          {errors.position && (
            <p className="text-sm text-destructive">{errors.position.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe your responsibilities and achievements..."
          rows={3}
          {...register("description")}
          disabled={isLoading}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            {...register("start_date")}
            disabled={isLoading}
          />
          {errors.start_date && (
            <p className="text-sm text-destructive">{errors.start_date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date">End Date</Label>
          <Input
            id="end_date"
            type="date"
            {...register("end_date")}
            disabled={isLoading || isCurrent}
          />
          {errors.end_date && (
            <p className="text-sm text-destructive">{errors.end_date.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="is_current"
          {...register("is_current")}
          disabled={isLoading}
          className="h-4 w-4 rounded border-input"
          onChange={(e) => {
            setValue("is_current", e.target.checked);
            if (e.target.checked) {
              setValue("end_date", "");
            }
          }}
        />
        <Label htmlFor="is_current" className="cursor-pointer">
          I currently work here
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="City, Country"
          {...register("location")}
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : isEditing ? "Update" : "Add"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
