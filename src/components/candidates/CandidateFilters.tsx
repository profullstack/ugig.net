"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SKILLS, AI_TOOLS } from "@/types";

interface CandidateFiltersProps {
  activeTags: string[];
  search?: string;
}

export function CandidateFilters({ activeTags, search }: CandidateFiltersProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(search || "");
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);

  const buildUrl = (tags: string[], newSearch?: string) => {
    const params = new URLSearchParams();
    if (newSearch) {
      params.set("q", newSearch);
    }
    if (tags.length > 0) {
      return `/candidates/${tags.map(encodeURIComponent).join(",")}${params.toString() ? `?${params.toString()}` : ""}`;
    }
    return `/candidates${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const addTag = (tag: string) => {
    if (!activeTags.includes(tag)) {
      router.push(buildUrl([...activeTags, tag], searchQuery));
    }
  };

  const removeTag = (tag: string) => {
    router.push(buildUrl(activeTags.filter((t) => t !== tag), searchQuery));
  };

  const clearAllTags = () => {
    router.push(buildUrl([], searchQuery));
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    router.push(buildUrl(activeTags, searchQuery));
  };

  const activeTagsLower = activeTags.map((t) => t.toLowerCase());
  const availableSkills = SKILLS.filter(
    (s) => !activeTagsLower.includes(s.toLowerCase())
  );
  const availableTools = AI_TOOLS.filter(
    (t) => !activeTagsLower.includes(t.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates by name, bio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Active Tags */}
      {activeTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtering by:</span>
          {activeTags.map((tag) => (
            <Badge
              key={tag}
              variant="default"
              className="cursor-pointer hover:bg-primary/80"
              onClick={() => removeTag(tag)}
            >
              {tag}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllTags}
            className="text-xs h-6"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Skills */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Skills:</span>
        <div className="flex flex-wrap gap-1.5">
          {(showAllSkills ? availableSkills : availableSkills.slice(0, 10)).map(
            (skill) => (
              <Badge
                key={skill}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => addTag(skill)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {skill}
              </Badge>
            )
          )}
          {availableSkills.length > 10 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllSkills(!showAllSkills)}
              className="text-xs h-6"
            >
              {showAllSkills ? "Show less" : `+${availableSkills.length - 10} more`}
            </Button>
          )}
        </div>
      </div>

      {/* AI Tools */}
      <div className="space-y-2">
        <span className="text-sm font-medium">AI Tools:</span>
        <div className="flex flex-wrap gap-1.5">
          {(showAllTools ? availableTools : availableTools.slice(0, 8)).map(
            (tool) => (
              <Badge
                key={tool}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => addTag(tool)}
              >
                <Plus className="h-3 w-3 mr-1" />
                {tool}
              </Badge>
            )
          )}
          {availableTools.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllTools(!showAllTools)}
              className="text-xs h-6"
            >
              {showAllTools ? "Show less" : `+${availableTools.length - 8} more`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
