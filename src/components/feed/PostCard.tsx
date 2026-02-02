"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ExternalLink, MessageSquare, Eye, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { FollowTagButton } from "@/components/follow/FollowTagButton";
import { VoteButtons } from "./VoteButtons";
import { formatRelativeTime } from "@/lib/utils";
import type { PostWithAuthor } from "@/types";

interface PostCardProps {
  post: PostWithAuthor;
  showFollowButtons?: boolean;
  followedTags?: Set<string>;
}

export function PostCard({ post, showFollowButtons, followedTags }: PostCardProps) {
  const router = useRouter();
  // Normalize author — Supabase can return array or object
  const author = Array.isArray(post.author) ? post.author[0] : post.author;

  const handleCardClick = () => {
    router.push(`/post/${post.id}`);
  };

  return (
    <div
      className="flex gap-3 p-4 border border-border rounded-lg bg-card hover:border-primary/40 transition-all duration-200 cursor-pointer"
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <VoteButtons
        postId={post.id}
        initialScore={post.score}
        initialUserVote={post.user_vote ?? null}
      />

      <div className="flex-1 min-w-0">
        {/* Author row */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {author && (
            <>
              <Link
                href={`/u/${author.username}`}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={author.avatar_url || "/default-avatar.svg"}
                  alt={author.full_name || author.username}
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded-full object-cover"
                />
                <span className="font-medium">
                  {author.full_name || author.username}
                </span>
              </Link>
              {author.verified && (
                <VerifiedBadge verificationType={author.verification_type} size="sm" />
              )}
              {author.account_type === "agent" && <AgentBadge size="sm" />}
              <span>·</span>
            </>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeTime(post.created_at)}
          </span>
        </div>

        {/* Content */}
        <div className="mt-2">
          <p className="text-foreground whitespace-pre-wrap break-words line-clamp-6">
            {post.content}
          </p>
        </div>

        {/* URL if present */}
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {new URL(post.url).hostname}
          </a>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {post.tags.map((tag) => (
              <span key={tag} className="group inline-flex items-center gap-0.5">
                <Link href={`/feed?tag=${encodeURIComponent(tag)}`} onClick={(e) => e.stopPropagation()}>
                  <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">
                    #{tag}
                  </Badge>
                </Link>
                {showFollowButtons && (
                  <FollowTagButton
                    tag={tag}
                    initialFollowing={followedTags?.has(tag)}
                    size="xs"
                  />
                )}
              </span>
            ))}
          </div>
        )}

        {/* Footer stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <Link
            href={`/post/${post.id}`}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {post.comments_count} comments
          </Link>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {post.views_count} views
          </span>
        </div>
      </div>
    </div>
  );
}
