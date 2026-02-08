import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { postCommentSchema } from "@/lib/validations";
import { sendEmail, newPostCommentEmail, newPostCommentReplyEmail, mentionInCommentEmail } from "@/lib/email";
import { parseMentions } from "@/lib/mentions";

const MAX_COMMENT_DEPTH = 4; // 0-indexed, so 5 levels (0,1,2,3,4)

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  depth: number;
  upvotes: number;
  downvotes: number;
  score: number;
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  }[];
}

function normalizeAuthor(comment: CommentRow) {
  return {
    ...comment,
    author: Array.isArray(comment.author) ? comment.author[0] : comment.author,
  };
}

function buildCommentTree(comments: CommentRow[]) {
  const normalized = comments.map(normalizeAuthor);
  const byId = new Map<string, ReturnType<typeof normalizeAuthor> & { replies: ReturnType<typeof normalizeAuthor>[] }>();

  // Initialize all comments with empty replies
  for (const c of normalized) {
    byId.set(c.id, { ...c, replies: [] });
  }

  const roots: (ReturnType<typeof normalizeAuthor> & { replies: ReturnType<typeof normalizeAuthor>[] })[] = [];

  for (const c of normalized) {
    const node = byId.get(c.id)!;
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// GET /api/posts/[id]/comments - List comments for a post
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify post exists
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", id)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Fetch all comments for this post with author info
    const { data: comments, error } = await supabase
      .from("post_comments")
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `
      )
      .eq("post_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Build recursive tree
    const threads = buildCommentTree((comments || []) as CommentRow[]);

    return NextResponse.json({
      comments: threads,
      total: comments?.length || 0,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/posts/[id]/comments - Create a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = postCommentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content, parent_id } = validationResult.data;

    // Verify post exists
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, author_id")
      .eq("id", id)
      .single();

    if (postError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // If replying, verify parent exists and check depth
    let parentDepth = -1;
    let parentComment: { id: string; post_id: string; parent_id: string | null; depth: number; author_id: string; content: string } | null = null;
    if (parent_id) {
      const { data: pc, error: parentError } = await supabase
        .from("post_comments")
        .select("id, post_id, parent_id, depth, author_id, content")
        .eq("id", parent_id)
        .single();

      if (parentError || !pc) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 404 }
        );
      }

      if (pc.post_id !== id) {
        return NextResponse.json(
          { error: "Parent comment belongs to a different post" },
          { status: 400 }
        );
      }

      parentDepth = pc.depth ?? 0;
      if (parentDepth >= MAX_COMMENT_DEPTH) {
        return NextResponse.json(
          {
            error: `Maximum comment depth of ${MAX_COMMENT_DEPTH + 1} levels reached.`,
          },
          { status: 400 }
        );
      }

      parentComment = pc;
    }

    const newDepth = parent_id ? parentDepth + 1 : 0;

    // Create the comment
    const { data: comment, error } = await supabase
      .from("post_comments")
      .insert({
        post_id: id,
        author_id: user.id,
        parent_id: parent_id || null,
        content,
        depth: newDepth,
      })
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Normalize author
    const normalizedComment = {
      ...comment,
      author: Array.isArray(comment.author)
        ? comment.author[0]
        : comment.author,
    };

    // Get commenter's profile for notifications
    const { data: commenterProfile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();

    const commenterName =
      commenterProfile?.full_name || commenterProfile?.username || "Someone";

    // Get post content for email
    const { data: fullPost } = await supabase
      .from("posts")
      .select("content")
      .eq("id", id)
      .single();

    const adminClient = createServiceClient();
    const notifiedUserIds = new Set<string>();
    notifiedUserIds.add(user.id); // Never notify yourself

    // Notify parent comment author on reply
    if (parent_id && parentComment && !notifiedUserIds.has(parentComment.author_id)) {
      notifiedUserIds.add(parentComment.author_id);

      void supabase
        .from("notifications")
        .insert({
          user_id: parentComment.author_id,
          type: "new_comment" as const,
          title: `${commenterName} replied to your comment`,
          body: content.slice(0, 200),
          data: { post_id: id, comment_id: comment.id, parent_id },
        })
        .then(() => {}, () => {});

      // Send email notification to parent comment author
      const { data: parentAuthorAuth } = await adminClient.auth.admin.getUserById(
        parentComment.author_id
      );
      const parentAuthorEmail = parentAuthorAuth?.user?.email;

      if (parentAuthorEmail) {
        const { data: parentAuthorProfile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", parentComment.author_id)
          .single();

        const emailContent = newPostCommentReplyEmail({
          recipientName: parentAuthorProfile?.full_name || parentAuthorProfile?.username || "there",
          replierName: commenterName,
          originalCommentPreview: parentComment.content || "",
          replyPreview: content,
          postId: id,
        });

        void sendEmail({
          to: parentAuthorEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        }).catch(() => {});
      }
    }

    // Notify post author (if not already notified and not self-commenting)
    if (!notifiedUserIds.has(post.author_id)) {
      notifiedUserIds.add(post.author_id);

      void supabase
        .from("notifications")
        .insert({
          user_id: post.author_id,
          type: "new_comment" as const,
          title: parent_id
            ? `${commenterName} replied to a comment on your post`
            : `${commenterName} commented on your post`,
          body: content.slice(0, 200),
          data: { post_id: id, comment_id: comment.id },
        })
        .then(() => {}, () => {});

      // Send email notification to post author
      const { data: postAuthorAuth } = await adminClient.auth.admin.getUserById(
        post.author_id
      );
      const postAuthorEmail = postAuthorAuth?.user?.email;

      if (postAuthorEmail) {
        const { data: postAuthorProfile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", post.author_id)
          .single();

        const emailContent = newPostCommentEmail({
          recipientName: postAuthorProfile?.full_name || postAuthorProfile?.username || "there",
          commenterName,
          postContentPreview: fullPost?.content || "",
          commentPreview: content,
          postId: id,
        });

        void sendEmail({
          to: postAuthorEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        }).catch(() => {});
      }
    }

    // Notify @mentioned users
    const mentionedUsernames = parseMentions(content);
    if (mentionedUsernames.length > 0) {
      const { data: mentionedProfiles } = await supabase
        .from("profiles")
        .select("id, username, full_name")
        .in("username", mentionedUsernames);

      if (mentionedProfiles && mentionedProfiles.length > 0) {
        for (const mentionedUser of mentionedProfiles) {
          if (notifiedUserIds.has(mentionedUser.id)) continue;
          notifiedUserIds.add(mentionedUser.id);

          void supabase
            .from("notifications")
            .insert({
              user_id: mentionedUser.id,
              type: "mention" as const,
              title: `${commenterName} mentioned you in a comment`,
              body: content.slice(0, 200),
              data: { post_id: id, comment_id: comment.id },
            })
            .then(() => {}, () => {});

          // Send email
          const { data: mentionedAuth } = await adminClient.auth.admin.getUserById(
            mentionedUser.id
          );
          const mentionedEmail = mentionedAuth?.user?.email;

          if (mentionedEmail) {
            const emailContent = mentionInCommentEmail({
              recipientName: mentionedUser.full_name || mentionedUser.username || "there",
              mentionerName: commenterName,
              commentPreview: content,
              postId: id,
            });

            void sendEmail({
              to: mentionedEmail,
              subject: emailContent.subject,
              html: emailContent.html,
              text: emailContent.text,
            }).catch(() => {});
          }
        }
      }
    }

    return NextResponse.json({ comment: normalizedComment }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
