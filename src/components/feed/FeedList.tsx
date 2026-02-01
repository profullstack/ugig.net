"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { PostCard } from "./PostCard";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { PostWithAuthor } from "@/types";

interface FeedListProps {
  initialPosts: PostWithAuthor[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function FeedList({ initialPosts, initialPagination }: FeedListProps) {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<PostWithAuthor[]>(initialPosts);
  const [page, setPage] = useState(initialPagination.page);
  const [totalPages, setTotalPages] = useState(initialPagination.totalPages);
  const [loading, setLoading] = useState(false);

  // Reset when search params change (sort, tag)
  useEffect(() => {
    setPosts(initialPosts);
    setPage(initialPagination.page);
    setTotalPages(initialPagination.totalPages);
  }, [initialPosts, initialPagination]);

  const loadMore = useCallback(async () => {
    if (loading || page >= totalPages) return;

    setLoading(true);
    try {
      const nextPage = page + 1;
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(nextPage));

      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      setPosts((prev) => [...prev, ...data.posts]);
      setPage(nextPage);
      setTotalPages(data.pagination.totalPages);
    } finally {
      setLoading(false);
    }
  }, [loading, page, totalPages, searchParams]);

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No posts yet</p>
        <p className="text-sm mt-1">Be the first to share something!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {page < totalPages && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
