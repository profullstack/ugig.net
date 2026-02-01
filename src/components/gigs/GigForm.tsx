"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { gigSchema, type GigInput } from "@/lib/validations";
import { gigs } from "@/lib/api";
import { trackGigCreated } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GIG_CATEGORIES, AI_TOOLS, SKILLS, PAYMENT_COINS } from "@/types";
import { X } from "lucide-react";

interface GigFormProps {
  initialData?: Partial<GigInput>;
  gigId?: string;
  mode?: "create" | "edit";
}

export function GigForm({ initialData, gigId, mode = "create" }: GigFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GigInput>({
    resolver: zodResolver(gigSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      skills_required: [],
      ai_tools_preferred: [],
      budget_type: "fixed",
      location_type: "remote",
      status: "draft",
      ...initialData,
    },
  });

  const selectedSkills = watch("skills_required");
  const selectedTools = watch("ai_tools_preferred");
  const budgetType = watch("budget_type");

  const toggleSkill = (skill: string) => {
    const current = selectedSkills || [];
    if (current.includes(skill)) {
      setValue(
        "skills_required",
        current.filter((s) => s !== skill)
      );
    } else if (current.length < 10) {
      setValue("skills_required", [...current, skill]);
    }
  };

  const toggleTool = (tool: string) => {
    const current = selectedTools || [];
    if (current.includes(tool)) {
      setValue(
        "ai_tools_preferred",
        current.filter((t) => t !== tool)
      );
    } else if (current.length < 10) {
      setValue("ai_tools_preferred", [...current, tool]);
    }
  };

  const onSubmit = async (data: GigInput) => {
    setIsLoading(true);
    setError(null);

    const result =
      mode === "edit" && gigId
        ? await gigs.update(gigId, data)
        : await gigs.create(data);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
      return;
    }

    if (mode === "create") {
      trackGigCreated({
        gig_id: (result.data as { gig: { id: string } })?.gig?.id,
        category: data.category,
      });
    }

    router.push("/dashboard/gigs");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          placeholder="e.g., Build a React Dashboard with AI Integration"
          {...register("title")}
          disabled={isLoading}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Describe the project in detail. What are the requirements? What deliverables do you expect?"
          rows={8}
          {...register("description")}
          disabled={isLoading}
        />
        {errors.description && (
          <p className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Category *</Label>
        <select
          id="category"
          {...register("category")}
          disabled={isLoading}
          className="w-full border border-input rounded-md px-3 py-2 bg-background"
        >
          <option value="">Select a category</option>
          {GIG_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="text-sm text-destructive">{errors.category.message}</p>
        )}
      </div>

      {/* Skills Required */}
      <div className="space-y-2">
        <Label>Required Skills * (select up to 10)</Label>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map((skill) => (
            <Badge
              key={skill}
              variant={selectedSkills?.includes(skill) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleSkill(skill)}
            >
              {skill}
              {selectedSkills?.includes(skill) && (
                <X className="h-3 w-3 ml-1" />
              )}
            </Badge>
          ))}
        </div>
        {errors.skills_required && (
          <p className="text-sm text-destructive">
            {errors.skills_required.message}
          </p>
        )}
      </div>

      {/* AI Tools */}
      <div className="space-y-2">
        <Label>Preferred AI Tools (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {AI_TOOLS.map((tool) => (
            <Badge
              key={tool}
              variant={selectedTools?.includes(tool) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleTool(tool)}
            >
              {tool}
              {selectedTools?.includes(tool) && <X className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Budget Type *</Label>
            <select
              {...register("budget_type")}
              disabled={isLoading}
              className="w-full border border-input rounded-md px-3 py-2 bg-background"
            >
              <option value="fixed">Fixed Price</option>
              <option value="hourly">Hourly Rate</option>
              <option value="per_task">Per Task</option>
              <option value="per_unit">Per Unit</option>
              <option value="revenue_share">Revenue Share</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget_min">
              {budgetType === "hourly" ? "Min Rate ($/hr)" :
               budgetType === "revenue_share" ? "Min Share (%)" :
               (budgetType === "per_task" || budgetType === "per_unit") ? "Min Rate ($/unit)" :
               "Min Budget ($)"}
            </Label>
            <Input
              id="budget_min"
              type="number"
              placeholder="0"
              step={budgetType === "per_task" || budgetType === "per_unit" ? "0.01" : "1"}
              {...register("budget_min", { valueAsNumber: true })}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget_max">
              {budgetType === "hourly" ? "Max Rate ($/hr)" :
               budgetType === "revenue_share" ? "Max Share (%)" :
               (budgetType === "per_task" || budgetType === "per_unit") ? "Max Rate ($/unit)" :
               "Max Budget ($)"}
            </Label>
            <Input
              id="budget_max"
              type="number"
              placeholder="0"
              step={budgetType === "per_task" || budgetType === "per_unit" ? "0.01" : "1"}
              {...register("budget_max", { valueAsNumber: true })}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Budget Unit - shown for per_task and per_unit */}
        {(budgetType === "per_task" || budgetType === "per_unit") && (
          <div className="space-y-2">
            <Label htmlFor="budget_unit">Unit Label *</Label>
            <Input
              id="budget_unit"
              placeholder='e.g., "post", "tweet", "image", "1000 words"'
              {...register("budget_unit")}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              What counts as one unit of work? This appears as &quot;$/post&quot;, &quot;$/image&quot;, etc.
            </p>
          </div>
        )}
      </div>

      {/* Payment Coin */}
      <div className="space-y-2">
        <Label htmlFor="payment_coin">Payment Coin</Label>
        <div className="flex gap-2">
          <select
            {...register("payment_coin")}
            disabled={isLoading}
            className="w-full border border-input rounded-md px-3 py-2 bg-background"
          >
            <option value="">Select coin...</option>
            {PAYMENT_COINS.map((coin) => (
              <option key={coin} value={coin}>
                {coin}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Which crypto will you pay in? Leave blank for fiat/negotiable.
        </p>
      </div>

      {/* Duration & Location */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (optional)</Label>
          <Input
            id="duration"
            placeholder="e.g., 2-4 weeks"
            {...register("duration")}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label>Work Location</Label>
          <select
            {...register("location_type")}
            disabled={isLoading}
            className="w-full border border-input rounded-md px-3 py-2 bg-background"
          >
            <option value="remote">Remote</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
      </div>

      {/* Location Detail */}
      <div className="space-y-2">
        <Label htmlFor="location">Location (if not fully remote)</Label>
        <Input
          id="location"
          placeholder="e.g., San Francisco, CA"
          {...register("location")}
          disabled={isLoading}
        />
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label>Status</Label>
        <select
          {...register("status")}
          disabled={isLoading}
          className="w-full border border-input rounded-md px-3 py-2 bg-background"
        >
          <option value="draft">Draft (save for later)</option>
          <option value="active">Active (publish now)</option>
        </select>
      </div>

      {/* Submit */}
      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? mode === "edit"
              ? "Saving..."
              : "Creating..."
            : mode === "edit"
              ? "Save Changes"
              : "Create Gig"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
