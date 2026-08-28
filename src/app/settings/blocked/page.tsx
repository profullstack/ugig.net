"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Ban, Loader2 } from "lucide-react";
import { BlockButton } from "@/components/blocks/BlockButton";

interface BlockedEntry {
  id: string;
  reason: string | null;
  created_at: string;
  user: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default function BlockedUsersPage() {
  const [blocks, setBlocks] = useState<BlockedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/blocks");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load blocked users");
        return;
      }

      setBlocks(data.data ?? []);
    } catch {
      setError("Failed to load blocked users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <Ban className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Blocked Users</h1>
          <p className="text-muted-foreground text-sm">
            Blocked users can&apos;t message you, and their posts stay out of
            your feed
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="p-8 bg-card border border-border rounded-lg text-center">
          <p className="text-sm text-muted-foreground">
            You haven&apos;t blocked anyone. You can block someone from their
            profile page.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {blocks.map((block) => (
            <div
              key={block.id}
              className="flex items-center justify-between p-4 gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Image
                  src={block.user?.avatar_url || "/default-avatar.svg"}
                  alt={block.user?.username || "User"}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  {block.user ? (
                    <Link
                      href={`/u/${block.user.username}`}
                      className="font-medium text-sm hover:underline"
                    >
                      {block.user.full_name || block.user.username}
                    </Link>
                  ) : (
                    <p className="font-medium text-sm">Deleted user</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {block.user ? `@${block.user.username} · ` : ""}
                    Blocked{" "}
                    {new Date(block.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {block.user && (
                <BlockButton
                  username={block.user.username}
                  initialBlocked
                  onChange={() =>
                    setBlocks((prev) => prev.filter((b) => b.id !== block.id))
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
