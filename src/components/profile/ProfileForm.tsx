"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { profileSchema } from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AI_TOOLS, SKILLS, type Profile } from "@/types";
import { X, Plus } from "lucide-react";

interface ProfileFormProps {
  profile: Profile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newPortfolioUrl, setNewPortfolioUrl] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newTool, setNewTool] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.output<typeof profileSchema>>({
    // Type assertion needed due to zod input/output type mismatch with react-hook-form
    resolver: zodResolver(profileSchema) as never,
    defaultValues: {
      username: profile.username || "",
      full_name: profile.full_name || "",
      bio: profile.bio || "",
      skills: profile.skills || [],
      ai_tools: profile.ai_tools || [],
      hourly_rate: profile.hourly_rate || undefined,
      portfolio_urls: profile.portfolio_urls || [],
      location: profile.location || "",
      timezone: profile.timezone || "",
      is_available: profile.is_available ?? true,
    },
  });

  const selectedSkills = watch("skills");
  const selectedTools = watch("ai_tools");
  const portfolioUrls = watch("portfolio_urls");

  const toggleSkill = (skill: string) => {
    const current = selectedSkills || [];
    if (current.includes(skill)) {
      setValue(
        "skills",
        current.filter((s) => s !== skill)
      );
    } else if (current.length < 20) {
      setValue("skills", [...current, skill]);
    }
  };

  const toggleTool = (tool: string) => {
    const current = selectedTools || [];
    if (current.includes(tool)) {
      setValue(
        "ai_tools",
        current.filter((t) => t !== tool)
      );
    } else if (current.length < 20) {
      setValue("ai_tools", [...current, tool]);
    }
  };

  const addCustomSkill = () => {
    const skill = newSkill.trim();
    if (!skill) return;
    const current = selectedSkills || [];
    if (current.length < 20 && !current.includes(skill)) {
      setValue("skills", [...current, skill]);
      setNewSkill("");
    }
  };

  const addCustomTool = () => {
    const tool = newTool.trim();
    if (!tool) return;
    const current = selectedTools || [];
    if (current.length < 20 && !current.includes(tool)) {
      setValue("ai_tools", [...current, tool]);
      setNewTool("");
    }
  };

  const addPortfolioUrl = () => {
    if (!newPortfolioUrl) return;
    try {
      new URL(newPortfolioUrl);
      const current = portfolioUrls || [];
      if (current.length < 10 && !current.includes(newPortfolioUrl)) {
        setValue("portfolio_urls", [...current, newPortfolioUrl]);
        setNewPortfolioUrl("");
      }
    } catch {
      setError("Please enter a valid URL");
    }
  };

  const removePortfolioUrl = (url: string) => {
    const current = portfolioUrls || [];
    setValue(
      "portfolio_urls",
      current.filter((u) => u !== url)
    );
  };

  const onSubmit = async (data: z.output<typeof profileSchema>) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to update profile");
        setIsLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {/* Basic Info Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Basic Information</h3>

        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">Username *</Label>
          <Input
            id="username"
            placeholder="johndoe"
            {...register("username")}
            disabled={isLoading}
          />
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your profile will be available at ugig.net/u/{watch("username") || "username"}
          </p>
        </div>

        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            placeholder="John Doe"
            {...register("full_name")}
            disabled={isLoading}
          />
          {errors.full_name && (
            <p className="text-sm text-destructive">{errors.full_name.message}</p>
          )}
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            placeholder="Tell us about yourself, your experience, and what makes you great at what you do..."
            rows={4}
            {...register("bio")}
            disabled={isLoading}
          />
          {errors.bio && (
            <p className="text-sm text-destructive">{errors.bio.message}</p>
          )}
        </div>
      </div>

      {/* Skills & Tools Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Skills & Tools</h3>

        {/* Skills */}
        <div className="space-y-2">
          <Label>Skills (select up to 20)</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add custom skill..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              disabled={isLoading || (selectedSkills?.length || 0) >= 20}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomSkill();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustomSkill}
              disabled={isLoading || (selectedSkills?.length || 0) >= 20}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {/* Show selected custom skills first */}
          {selectedSkills && selectedSkills.filter(s => !(SKILLS as readonly string[]).includes(s)).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedSkills.filter(s => !(SKILLS as readonly string[]).includes(s)).map((skill) => (
                <Badge
                  key={skill}
                  variant="default"
                  className="cursor-pointer bg-primary/80 hover:bg-primary/70 transition-colors"
                  onClick={() => toggleSkill(skill)}
                >
                  {skill}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((skill) => (
              <Badge
                key={skill}
                variant={selectedSkills?.includes(skill) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => toggleSkill(skill)}
              >
                {skill}
                {selectedSkills?.includes(skill) && <X className="h-3 w-3 ml-1" />}
              </Badge>
            ))}
          </div>
          {errors.skills && (
            <p className="text-sm text-destructive">{errors.skills.message}</p>
          )}
        </div>

        {/* AI Tools */}
        <div className="space-y-2">
          <Label>AI Tools You Use</Label>
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Add custom AI tool..."
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              disabled={isLoading || (selectedTools?.length || 0) >= 20}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomTool();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustomTool}
              disabled={isLoading || (selectedTools?.length || 0) >= 20}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {/* Show selected custom tools first */}
          {selectedTools && selectedTools.filter(t => !(AI_TOOLS as readonly string[]).includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedTools.filter(t => !(AI_TOOLS as readonly string[]).includes(t)).map((tool) => (
                <Badge
                  key={tool}
                  variant="default"
                  className="cursor-pointer bg-primary/80 hover:bg-primary/70 transition-colors"
                  onClick={() => toggleTool(tool)}
                >
                  {tool}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {AI_TOOLS.map((tool) => (
              <Badge
                key={tool}
                variant={selectedTools?.includes(tool) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => toggleTool(tool)}
              >
                {tool}
                {selectedTools?.includes(tool) && <X className="h-3 w-3 ml-1" />}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Professional Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Professional</h3>

        {/* Hourly Rate */}
        <div className="space-y-2">
          <Label htmlFor="hourly_rate">Hourly Rate ($/hr)</Label>
          <Input
            id="hourly_rate"
            type="number"
            placeholder="50"
            {...register("hourly_rate", { valueAsNumber: true })}
            disabled={isLoading}
          />
          {errors.hourly_rate && (
            <p className="text-sm text-destructive">{errors.hourly_rate.message}</p>
          )}
        </div>

        {/* Portfolio URLs */}
        <div className="space-y-2">
          <Label>Portfolio Links (up to 10)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://github.com/username"
              value={newPortfolioUrl}
              onChange={(e) => setNewPortfolioUrl(e.target.value)}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPortfolioUrl();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={addPortfolioUrl}
              disabled={isLoading || (portfolioUrls?.length || 0) >= 10}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {portfolioUrls && portfolioUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {portfolioUrls.map((url) => (
                <Badge key={url} variant="secondary" className="max-w-full hover:bg-secondary/80 transition-colors">
                  <span className="truncate max-w-[200px]">{url}</span>
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer flex-shrink-0"
                    onClick={() => removePortfolioUrl(url)}
                  />
                </Badge>
              ))}
            </div>
          )}
          {errors.portfolio_urls && (
            <p className="text-sm text-destructive">{errors.portfolio_urls.message}</p>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Location Section */}
      <div className="space-y-5">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Location & Availability</h3>

        {/* Location & Timezone */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="San Francisco, CA"
              {...register("location")}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              placeholder="PST (UTC-8)"
              {...register("timezone")}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Availability */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
          <input
            type="checkbox"
            id="is_available"
            {...register("is_available")}
            disabled={isLoading}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <Label htmlFor="is_available" className="cursor-pointer">
            Available for work
          </Label>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Submit */}
      <div className="flex gap-4 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Profile"}
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
