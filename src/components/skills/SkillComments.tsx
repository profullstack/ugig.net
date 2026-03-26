"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, Reply } from "lucide-react";
import Link from "next/link";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

interface Comment {
  id: string;
  content: string;
  depth: number;
  created_at: string;
  author: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  replies: Comment[];
}

interface SkillCommentsProps {
  slug: string;
  isAuthenticated: boolean;
}

export function SkillComments({ slug, isAuthenticated }: SkillCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fetchComments() {
    try {
      const res = await fetch(`/api/skills/${slug}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  async function handlePost(parentId: string | null = null) {
    const content = parentId ? replyContent : newComment;
    if (!content.trim()) return;

    setPosting(true);
    setError(null);

    try {
      const res = await fetch(`/api/skills/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          parent_id: parentId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post comment");
        return;
      }

      // Refresh comments
      if (parentId) {
        setReplyContent("");
        setReplyTo(null);
      } else {
        setNewComment("");
      }
      await fetchComments();
    } catch {
      setError("Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  function renderComment(comment: Comment) {
    return (
      <div
        key={comment.id}
        className={`${comment.depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}
      >
        <div className="py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Avatar className="h-6 w-6">
              {comment.author?.avatar_url && (
                <AvatarImage src={comment.author.avatar_url} />
              )}
              <AvatarFallback className="text-xs">
                {(comment.author?.username || "?")[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Link
              href={`/u/${comment.author?.username}`}
              className="text-sm font-medium hover:underline"
            >
              {comment.author?.full_name || comment.author?.username}
            </Link>
            <span className="text-xs text-muted-foreground">
              {new Date(comment.created_at).toLocaleDateString()}
            </span>
          </div>

          <MarkdownContent content={comment.content || ""} className="text-sm" />

          {isAuthenticated && comment.depth < 4 && (
            <button
              onClick={() => {
                setReplyTo(replyTo === comment.id ? null : comment.id);
                setReplyContent("");
              }}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Reply className="h-3 w-3" /> Reply
            </button>
          )}

          {/* Inline reply form */}
          {replyTo === comment.id && (
            <div className="mt-2 flex gap-2">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                rows={2}
                maxLength={2000}
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button
                size="sm"
                onClick={() => handlePost(comment.id)}
                disabled={posting || !replyContent.trim()}
              >
                {posting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reply"}
              </Button>
            </div>
          )}
        </div>

        {/* Nested replies */}
        {comment.replies?.map((reply) => renderComment(reply))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        Comments
        {total > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            ({total})
          </span>
        )}
      </h2>

      {/* New comment form */}
      {isAuthenticated ? (
        <div className="mb-6 space-y-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts on this skill..."
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {newComment.length}/2000
            </span>
            <Button
              size="sm"
              onClick={() => handlePost()}
              disabled={posting || !newComment.trim()}
            >
              {posting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <MessageSquare className="h-3 w-3 mr-1" />
              )}
              Post Comment
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to leave a comment.
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length > 0 ? (
        <div className="divide-y divide-border">
          {comments.map((comment) => renderComment(comment))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm py-4">
          No comments yet. Be the first to share your thoughts!
        </p>
      )}
    </div>
  );
}
