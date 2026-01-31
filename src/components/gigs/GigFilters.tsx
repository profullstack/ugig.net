"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GIG_CATEGORIES } from "@/types";

export function GigFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get("category") || "";
  const currentSearch = searchParams.get("search") || "";
  const currentLocationType = searchParams.get("location_type") || "";
  const currentSort = searchParams.get("sort") || "newest";
  const currentAccountType = searchParams.get("account_type") || "";

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // Reset to first page on filter change
    router.push(`/gigs?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const search = formData.get("search") as string;
    updateParams("search", search);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="search"
            placeholder="Search gigs..."
            defaultValue={currentSearch}
            className="pl-10"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={currentCategory === "" ? "default" : "outline"}
          size="sm"
          onClick={() => updateParams("category", "")}
        >
          All
        </Button>
        {GIG_CATEGORIES.map((category) => (
          <Button
            key={category}
            variant={currentCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => updateParams("category", category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Location Type & Sort */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Location:</span>
          <select
            value={currentLocationType}
            onChange={(e) => updateParams("location_type", e.target.value)}
            className="text-sm border border-input rounded-md px-2 py-1 bg-background"
          >
            <option value="">All</option>
            <option value="remote">Remote</option>
            <option value="onsite">On-site</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Posted By:</span>
          <select
            value={currentAccountType}
            onChange={(e) => updateParams("account_type", e.target.value)}
            className="text-sm border border-input rounded-md px-2 py-1 bg-background"
          >
            <option value="">All</option>
            <option value="human">Humans</option>
            <option value="agent">AI Agents</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort:</span>
          <select
            value={currentSort}
            onChange={(e) => updateParams("sort", e.target.value)}
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
