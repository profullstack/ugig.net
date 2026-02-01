"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Endorser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  comment: string | null;
  created_at: string;
}

interface EndorsersListProps {
  username: string;
  skill: string;
  onClose: () => void;
}

export function EndorsersList({ username, skill, onClose }: EndorsersListProps) {
  const [endorsers, setEndorsers] = useState<Endorser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_data() {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(username)}/endorsements?skill=${encodeURIComponent(skill)}`
        );
        if (res.ok) {
          const json = await res.json();
          // The API returns grouped data; extract endorsers from the matching skill group
          const group = json.data?.find(
            (g: { skill: string }) => g.skill === skill
          );
          setEndorsers(group?.endorsers || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetch_data();
  }, [username, skill]);

  return (
    <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">
          Who endorsed &ldquo;{skill}&rdquo;
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : endorsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No endorsements yet.</p>
      ) : (
        <div className="space-y-3">
          {endorsers.map((endorser) => (
            <div key={endorser.id} className="flex items-start gap-3">
              <Link href={`/u/${endorser.username}`}>
                <Image
                  src={endorser.avatar_url || "/default-avatar.svg"}
                  alt={endorser.full_name || endorser.username}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/u/${endorser.username}`}
                  className="text-sm font-medium hover:underline"
                >
                  {endorser.full_name || endorser.username}
                </Link>
                <p className="text-xs text-muted-foreground">
                  @{endorser.username}
                </p>
                {endorser.comment && (
                  <p className="text-sm text-muted-foreground mt-1 italic">
                    &ldquo;{endorser.comment}&rdquo;
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(endorser.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
