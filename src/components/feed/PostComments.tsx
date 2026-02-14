"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageSquare, Reply, Edit2, Trash2, Send, X, ArrowBigUp, ArrowBigDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MentionTextarea } from "@/components/ui/mention-textarea";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { parseContentWithMentions } from "@/lib/mentions";

function CommentContent({ content }: { content: string }) {
  const segments = parseContentWithMentions(content);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "mention" ? (
          <Link
            key={i}
            href={`/u/${seg.username}`}
            className="text-blue-600 hover:underline font-medium"
          >
            @{seg.username}
          </Link>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </>
  );
}

interface CommentAuthor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface CommentData {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  depth: number;
  score: number;
  upvotes: number;
  downvotes: number;
  created_at: string;
  updated_at: string;
  author: CommentAuthor;
  replies: CommentData[];
}

interface PostCommentsProps {
  postId: string;
  currentUserId?: string;
  postAuthorId: string;
}

const MAX_DEPTH = 4; // 0-indexed, matches API

export function PostComments({
  postId,
  currentUserId,
  postAuthorId,
}: PostCommentsProps) {
  const [threads, setThreads] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      setThreads(data.comments || []);
    } catch {
      setError("Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post comment");
      }

      setNewComment("");
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent.trim(),
          parent_id: parentId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post reply");
      }

      setReplyingTo(null);
      setReplyContent("");
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editContent.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/posts/${postId}/comments/${commentId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent.trim() }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update comment");
      }

      setEditingId(null);
      setEditContent("");
      await fetchComments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update comment"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    setError(null);

    try {
      const res = await fetch(
        `/api/posts/${postId}/comments/${commentId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete comment");
      }

      await fetchComments();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete comment"
      );
    }
  };

  const handleVote = async (commentId: string, direction: "up" | "down") => {
    try {
      const res = await fetch(
        `/api/posts/${postId}/comments/${commentId}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction }),
        }
      );

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) return;

      // Refresh comments to get updated scores
      await fetchComments();
    } catch {
      // Silently fail
    }
  };

  const canDelete = (authorId: string) =>
    currentUserId === authorId || currentUserId === postAuthorId;

  const countAllComments = (comments: CommentData[]): number => {
    let count = 0;
    for (const c of comments) {
      count += 1;
      if (c.replies) count += countAllComments(c.replies);
    }
    return count;
  };

  const renderComment = (comment: CommentData) => {
    const isEditing = editingId === comment.id;
    const author = comment.author;
    const depth = comment.depth || 0;
    const isReply = depth > 0;
    const canReply = depth < MAX_DEPTH;

    // Indentation based on depth, capped for readability
    const indentClass = depth > 0
      ? depth === 1 ? "ml-6 sm:ml-10"
      : depth === 2 ? "ml-10 sm:ml-16"
      : depth === 3 ? "ml-14 sm:ml-20"
      : "ml-16 sm:ml-24"
      : "";

    return (
      <div key={comment.id}>
        <div
          className={`flex gap-3 ${indentClass} ${isReply ? "pt-3" : ""}`}
        >
          {/* Comment vote buttons */}
          <div className="flex flex-col items-center gap-0.5 pt-1">
            <button
              onClick={() => handleVote(comment.id, "up")}
              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-orange-500 cursor-pointer"
              aria-label="Upvote comment"
            >
              <ArrowBigUp className="h-4 w-4" />
            </button>
            <span className={cn(
              "text-xs font-semibold tabular-nums",
              (comment.score || 0) > 0 && "text-orange-500",
              (comment.score || 0) < 0 && "text-blue-500"
            )}>
              {comment.score || 0}
            </span>
            <button
              onClick={() => handleVote(comment.id, "down")}
              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-blue-500 cursor-pointer"
              aria-label="Downvote comment"
            >
              <ArrowBigDown className="h-4 w-4" />
            </button>
          </div>

          <Link href={`/u/${author?.username}`}>
            <Image
              src={author?.avatar_url || "/default-avatar.svg"}
              alt={author?.full_name || author?.username || "User"}
              width={isReply ? 32 : 40}
              height={isReply ? 32 : 40}
              className={`${isReply ? "h-8 w-8" : "h-10 w-10"} rounded-full object-cover flex-shrink-0`}
            />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/u/${author?.username}`}
                className="font-medium text-sm hover:underline"
              >
                {author?.full_name || author?.username || "Unknown"}
              </Link>
              {comment.author_id === postAuthorId && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  Author
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(comment.created_at)}
              </span>
              {comment.updated_at !== comment.created_at && (
                <span className="text-xs text-muted-foreground">(edited)</span>
              )}
            </div>

            {isEditing ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[80px] text-sm"
                  maxLength={2000}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleUpdateComment(comment.id)}
                    disabled={submitting || !editContent.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setEditContent("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                <CommentContent content={comment.content} />
              </p>
            )}

            {/* Action buttons */}
            {!isEditing && currentUserId && (
              <div className="flex items-center gap-3 mt-2">
                {canReply && (
                  <button
                    onClick={() => {
                      setReplyingTo(
                        replyingTo === comment.id ? null : comment.id
                      );
                      setReplyContent("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </button>
                )}
                {comment.author_id === currentUserId && (
                  <button
                    onClick={() => {
                      setEditingId(comment.id);
                      setEditContent(comment.content);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </button>
                )}
                {canDelete(comment.author_id) && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Reply form */}
        {replyingTo === comment.id && currentUserId && (
          <div className={`${indentClass} ml-10 mt-3 pt-3 border-t border-border`}>
            <MentionTextarea
              placeholder="Write a reply..."
              value={replyContent}
              onChange={(val) => setReplyContent(val)}
              className="min-h-[80px] text-sm mb-2"
              maxLength={2000}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleSubmitReply(comment.id)}
                disabled={submitting || !replyContent.trim()}
              >
                <Send className="h-3 w-3 mr-1" />
                {submitting ? "Posting..." : "Reply"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="border-l-2 border-border mt-1">
            {comment.replies.map((reply) => renderComment(reply))}
          </div>
        )}
      </div>
    );
  };

  const totalComments = countAllComments(threads);

  return (
    <div id="comments" className="scroll-mt-20">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        Comments
        {totalComments > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            ({totalComments})
          </span>
        )}
      </h2>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* New comment form */}
      {currentUserId ? (
        <form onSubmit={handleSubmitComment} className="mb-8">
          <MentionTextarea
            placeholder="Write a comment..."
            value={newComment}
            onChange={(val) => setNewComment(val)}
            className="min-h-[100px] mb-3"
            maxLength={2000}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {newComment.length}/2000
            </span>
            <Button
              type="submit"
              disabled={submitting || !newComment.trim()}
              size="sm"
            >
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "Posting..." : "Post Comment"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="text-center py-6 mb-6 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">
            <a
              href={`/login?redirect=/post/${postId}`}
              className="text-primary hover:underline"
            >
              Log in
            </a>{" "}
            to comment or reply
          </p>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-3/4 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="border border-border rounded-lg p-4"
            >
              {renderComment(thread)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
