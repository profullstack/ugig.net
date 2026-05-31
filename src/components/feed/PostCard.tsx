"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ExternalLink, MessageSquare, Eye, Clock, Pencil, X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { ReputationBadge } from "@/components/ui/ReputationBadge";
import { FollowTagButton } from "@/components/follow/FollowTagButton";
import { VoteButtons } from "./VoteButtons";
import { ZapButton } from "@/components/zaps/ZapButton";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { formatRelativeTime } from "@/lib/utils";
import type { PostWithAuthor } from "@/types";
import { PollDisplay } from "./PollDisplay";

interface PostCardProps {
  post: PostWithAuthor;
  showFollowButtons?: boolean;
  followedTags?: Set<string>;
  expanded?: boolean;
  currentUserId?: string;
}

export function PostCard({ post: initialPost, showFollowButtons, followedTags, expanded, currentUserId }: PostCardProps) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content || "");
  const [editUrl, setEditUrl] = useState(post.url || "");
  const [editTags, setEditTags] = useState<string[]>(post.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Normalize author — Supabase can return array or object
  const author = Array.isArray(post.author) ? post.author[0] : post.author;
  const canEdit = !!currentUserId && post.author_id === currentUserId;

  const handleCardClick = () => {
    if (isEditing) return;
    router.push(`/post/${post.id}`);
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContent(post.content || "");
    setEditUrl(post.url || "");
    setEditTags(post.tags || []);
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditError(null);
  };

  const addEditTag = () => {
    const tag = tagInput.trim().replace(/^#/, "");
    if (tag && !editTags.includes(tag) && editTags.length < 10) {
      setEditTags([...editTags, tag]);
      setTagInput("");
    }
  };

  const deletePost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || "Failed to delete post");
        setDeleting(false);
        return;
      }
      if (expanded) {
        router.push("/feed");
      } else {
        setDeleted(true);
      }
    } catch {
      setEditError("Something went wrong. Please try again.");
      setDeleting(false);
    }
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editContent.trim()) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent.trim(),
          url: editUrl.trim() || null,
          tags: editTags,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to update post");
        return;
      }
      setPost({ ...post, ...data.post, author: post.author });
      setIsEditing(false);
    } catch {
      setEditError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (deleted) return null;

  const wasEdited =
    post.updated_at &&
    post.created_at &&
    new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 1000;

  return (
    <div
      className="flex gap-3 p-4 border border-border rounded-lg bg-card hover:border-primary/40 transition-all duration-200 cursor-pointer overflow-hidden"
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
              {author.did && <ReputationBadge did={author.did} size="sm" />}
              <span>·</span>
            </>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeTime(post.created_at)}
          </span>
          {wasEdited && (
            <span className="text-xs italic text-muted-foreground" title={`Edited ${new Date(post.updated_at!).toLocaleString()}`}>
              (edited)
            </span>
          )}
          {canEdit && !isEditing && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                aria-label="Edit post"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={deletePost}
                disabled={deleting}
                className="inline-flex items-center gap-1 hover:text-destructive transition-colors disabled:opacity-50"
                aria-label="Delete post"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              maxLength={5000}
              className="resize-none"
            />
            <Input
              type="url"
              placeholder="Link URL (optional)"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addEditTag();
                  }
                }}
                className="flex-1 h-8 text-sm"
              />
              <Button type="button" variant="ghost" size="sm" onClick={addEditTag} disabled={!tagInput.trim()} className="h-8">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {editTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {editTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs gap-1 cursor-pointer"
                    onClick={() => setEditTags(editTags.filter((t) => t !== tag))}
                  >
                    #{tag}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={saveEdit} disabled={saving || !editContent.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2" onClick={(e) => {
            // Only stop propagation if clicking an actual link
            if ((e.target as HTMLElement).closest('a')) {
              e.stopPropagation();
            }
          }}>
            <MarkdownContent
              content={post.content || ""}
              clamp={expanded ? undefined : "line-clamp-6"}
              className="break-words"
            />
          </div>
        )}

        {/* Poll if present */}
        {post.post_type === "poll" && (
          <PollDisplay postId={post.id} isLoggedIn={!!currentUserId} />
        )}

        {/* URL if present */}
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{new URL(post.url).hostname}</span>
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
          {post.author_id && (
            <ZapButton targetType="post" targetId={post.id} recipientId={post.author_id} />
          )}
        </div>
      </div>
    </div>
  );
}
