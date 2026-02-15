"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GIG_CATEGORIES } from "@/types";
import Link from "next/link";

// Popular skills for quick tag selection
const POPULAR_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "AI/ML",
  "LLM",
  "ChatGPT",
  "Claude",
  "Cursor",
  "Design",
  "UI/UX",
];

interface GigFiltersWithTagsProps {
  activeTags: string[];
  search?: string;
  category?: string;
  locationType?: string;
  sort?: string;
}

export function GigFiltersWithTags({
  activeTags,
  search,
  category,
  locationType,
  sort,
}: GigFiltersWithTagsProps) {
  const router = useRouter();

  const currentSort = sort || "newest";

  const buildUrl = (
    tags: string[],
    newParams?: Record<string, string | undefined>
  ) => {
    const params = new URLSearchParams();

    // Handle search
    const searchValue = newParams?.search !== undefined ? newParams.search : search;
    if (searchValue) params.set("search", searchValue);

    // Handle category
    const categoryValue = newParams?.category !== undefined ? newParams.category : category;
    if (categoryValue) params.set("category", categoryValue);

    // Handle location type
    const locationValue = newParams?.location_type !== undefined ? newParams.location_type : locationType;
    if (locationValue) params.set("location_type", locationValue);

    // Handle sort
    const sortValue = newParams?.sort !== undefined ? newParams.sort : currentSort;
    if (sortValue && sortValue !== "newest") params.set("sort", sortValue);

    if (tags.length > 0) {
      params.set("skill", tags.map(encodeURIComponent).join(","));
    }
    const queryString = params.toString();
    return `/gigs${queryString ? `?${queryString}` : ""}`;
  };

  const addTag = (tag: string) => {
    if (!activeTags.map(t => t.toLowerCase()).includes(tag.toLowerCase())) {
      router.push(buildUrl([...activeTags, tag]));
    }
  };

  const removeTag = (tag: string) => {
    router.push(buildUrl(activeTags.filter((t) => t.toLowerCase() !== tag.toLowerCase())));
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const searchValue = formData.get("search") as string;
    router.push(buildUrl(activeTags, { search: searchValue }));
  };

  const updateParam = (key: string, value: string) => {
    router.push(buildUrl(activeTags, { [key]: value }));
  };

  // Available skills to add (exclude already selected)
  const availableSkills = POPULAR_SKILLS.filter(
    (skill) => !activeTags.map((t) => t.toLowerCase()).includes(skill.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="search"
            placeholder="Search gigs..."
            defaultValue={search}
            className="pl-10"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Active Tags */}
      {activeTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Skills:</span>
          {activeTags.map((tag) => (
            <Badge
              key={tag}
              variant="default"
              className="cursor-pointer gap-1"
              onClick={() => removeTag(tag)}
            >
              {tag}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          <Link href="/gigs" className="text-sm text-primary hover:underline ml-2">
            Clear all
          </Link>
        </div>
      )}

      {/* Quick Add Tags */}
      {availableSkills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Add skill:</span>
          {availableSkills.slice(0, 8).map((skill) => (
            <Badge
              key={skill}
              variant="outline"
              className="cursor-pointer hover:bg-primary/10"
              onClick={() => addTag(skill)}
            >
              + {skill}
            </Badge>
          ))}
        </div>
      )}

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={!category ? "default" : "outline"}
          size="sm"
          onClick={() => updateParam("category", "")}
        >
          All Categories
        </Button>
        {GIG_CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={category === cat ? "default" : "outline"}
            size="sm"
            onClick={() => updateParam("category", cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Location Type & Sort */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Location:</span>
          <select
            value={locationType || ""}
            onChange={(e) => updateParam("location_type", e.target.value)}
            className="text-sm border border-input rounded-md px-2 py-1 bg-background"
          >
            <option value="">All</option>
            <option value="remote">Remote</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort:</span>
          <select
            value={currentSort}
            onChange={(e) => updateParam("sort", e.target.value)}
            className="text-sm border border-input rounded-md px-2 py-1 bg-background"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="budget_high">Budget: High to Low</option>
            <option value="budget_low">Budget: Low to High</option>
          </select>
        </div>
      </div>
    </div>
  );
}
