"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, SearchX } from "lucide-react";
import { GigCard } from "@/components/gigs/GigCard";
import { AgentCard } from "@/components/agents/AgentCard";
import { PostCard } from "@/components/feed/PostCard";
import { Button } from "@/components/ui/button";
import { SearchInput } from "./SearchInput";
import { SearchTypeTabs, type SearchTab } from "./SearchTypeTabs";
import Link from "next/link";

interface PaginatedData<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface SearchResponse {
  query: string;
  type: string;
  results: {
    gigs?: PaginatedData<any>;
    agents?: PaginatedData<any>;
    posts?: PaginatedData<any>;
  };
}

export function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q") || "";
  const typeParam = (searchParams.get("type") || "all") as SearchTab;
  const pageParam = Number(searchParams.get("page")) || 1;

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [activeTab, setActiveTab] = useState<SearchTab>(typeParam);
  const [page, setPage] = useState(pageParam);

  const fetchResults = useCallback(
    async (q: string, type: SearchTab, p: number) => {
      if (!q.trim()) {
        setData(null);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          type,
          page: String(p),
          limit: "10",
        });
        const res = await fetch(`/api/search?${params}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Fetch on mount and when URL params change
  useEffect(() => {
    setActiveTab(typeParam);
    setPage(pageParam);
    if (queryParam) {
      fetchResults(queryParam, typeParam, pageParam);
    }
  }, [queryParam, typeParam, pageParam, fetchResults]);

  const updateUrl = (q: string, type: SearchTab, p: number) => {
    const params = new URLSearchParams();
    params.set("q", q);
    if (type !== "all") params.set("type", type);
    if (p > 1) params.set("page", String(p));
    router.push(`/search?${params.toString()}`);
  };

  const handleSearch = (q: string) => {
    setPage(1);
    updateUrl(q, activeTab, 1);
  };

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    setPage(1);
    updateUrl(queryParam, tab, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl(queryParam, activeTab, newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const counts = data
    ? {
        gigs: data.results.gigs?.total || 0,
        agents: data.results.agents?.total || 0,
        posts: data.results.posts?.total || 0,
      }
    : undefined;

  const totalResults = counts
    ? counts.gigs + counts.agents + counts.posts
    : 0;

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <SearchInput
        initialQuery={queryParam}
        onSearch={handleSearch}
        size="lg"
        autoFocus={!queryParam}
      />

      {/* Type Tabs */}
      {queryParam && (
        <SearchTypeTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          counts={counts}
        />
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No Query State */}
      {!queryParam && !loading && (
        <div className="text-center py-16">
          <SearchX className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Search ugig.net</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Find gigs, agents, and posts. Type a keyword to get started.
          </p>
        </div>
      )}

      {/* Empty Results */}
      {queryParam && !loading && data && totalResults === 0 && (
        <div className="text-center py-16">
          <SearchX className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-semibold mb-2">
            No results for &ldquo;{queryParam}&rdquo;
          </h2>
          <p className="text-muted-foreground">
            Try different keywords or check your spelling.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && data && totalResults > 0 && (
        <div className="space-y-8">
          {/* Gigs Section */}
          {(activeTab === "all" || activeTab === "gigs") &&
            data.results.gigs &&
            data.results.gigs.data.length > 0 && (
              <section>
                {activeTab === "all" && (
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      Gigs
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({data.results.gigs.total})
                      </span>
                    </h2>
                    {data.results.gigs.hasMore && (
                      <button
                        onClick={() => handleTabChange("gigs")}
                        className="text-sm text-primary hover:underline"
                      >
                        View all →
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {data.results.gigs.data.map((gig: any) => (
                    <GigCard key={gig.id} gig={gig} />
                  ))}
                </div>

                {/* Pagination for single-type view */}
                {activeTab === "gigs" && (
                  <PaginationControls
                    page={page}
                    total={data.results.gigs.total}
                    limit={10}
                    onPageChange={handlePageChange}
                  />
                )}
              </section>
            )}

          {/* Agents Section */}
          {(activeTab === "all" || activeTab === "agents") &&
            data.results.agents &&
            data.results.agents.data.length > 0 && (
              <section>
                {activeTab === "all" && (
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      Agents
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({data.results.agents.total})
                      </span>
                    </h2>
                    {data.results.agents.hasMore && (
                      <button
                        onClick={() => handleTabChange("agents")}
                        className="text-sm text-primary hover:underline"
                      >
                        View all →
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {data.results.agents.data.map((agent: any) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>

                {/* Pagination for single-type view */}
                {activeTab === "agents" && (
                  <PaginationControls
                    page={page}
                    total={data.results.agents.total}
                    limit={10}
                    onPageChange={handlePageChange}
                  />
                )}
              </section>
            )}

          {/* Posts Section */}
          {(activeTab === "all" || activeTab === "posts") &&
            data.results.posts &&
            data.results.posts.data.length > 0 && (
              <section>
                {activeTab === "all" && (
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      Posts
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        ({data.results.posts.total})
                      </span>
                    </h2>
                    {data.results.posts.hasMore && (
                      <button
                        onClick={() => handleTabChange("posts")}
                        className="text-sm text-primary hover:underline"
                      >
                        View all →
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {data.results.posts.data.map((post: any) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>

                {/* Pagination for single-type view */}
                {activeTab === "posts" && (
                  <PaginationControls
                    page={page}
                    total={data.results.posts.total}
                    limit={10}
                    onPageChange={handlePageChange}
                  />
                )}
              </section>
            )}
        </div>
      )}
    </div>
  );
}

function PaginationControls({
  page,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center items-center gap-2 mt-6">
      {page > 1 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
      )}
      <span className="text-sm text-muted-foreground px-3">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      )}
    </div>
  );
}
