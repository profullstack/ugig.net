import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { postCommentSchema } from "@/lib/validations";
import { sendEmail, newPostCommentEmail, newPostCommentReplyEmail } from "@/lib/email";

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

    // Organize into threads: top-level comments with nested replies
    const topLevel = (comments || []).filter((c) => !c.parent_id);
    const replies = (comments || []).filter((c) => c.parent_id);

    const threads = topLevel.map((comment) => ({
      ...comment,
      author: Array.isArray(comment.author)
        ? comment.author[0]
        : comment.author,
      replies: replies
        .filter((r) => r.parent_id === comment.id)
        .map((r) => ({
          ...r,
          author: Array.isArray(r.author) ? r.author[0] : r.author,
        })),
    }));

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

    // If replying, verify parent exists and belongs to this post
    // Also enforce one level of nesting (parent must be a top-level comment)
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from("post_comments")
        .select("id, post_id, parent_id")
        .eq("id", parent_id)
        .single();

      if (parentError || !parentComment) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 404 }
        );
      }

      if (parentComment.post_id !== id) {
        return NextResponse.json(
          { error: "Parent comment belongs to a different post" },
          { status: 400 }
        );
      }

      if (parentComment.parent_id) {
        return NextResponse.json(
          {
            error:
              "Cannot reply to a reply. Only one level of nesting is allowed.",
          },
          { status: 400 }
        );
      }
    }

    // Create the comment
    const { data: comment, error } = await supabase
      .from("post_comments")
      .insert({
        post_id: id,
        author_id: user.id,
        parent_id: parent_id || null,
        content,
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

    // Create in-app notification for post author (if not self-commenting)
    if (post.author_id !== user.id && !parent_id) {
      void supabase
        .from("notifications")
        .insert({
          user_id: post.author_id,
          type: "new_comment" as const,
          title: `${commenterName} commented on your post`,
          body: content.slice(0, 200),
          data: { post_id: id, comment_id: comment.id },
        })
        .then(
          () => {},
          () => {}
        );

      // Send email notification to post author
      const adminClient = createServiceClient();
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

    // Notify parent comment author on reply
    if (parent_id) {
      const { data: parentComment } = await supabase
        .from("post_comments")
        .select("author_id, content")
        .eq("id", parent_id)
        .single();

      if (parentComment && parentComment.author_id !== user.id) {
        void supabase
          .from("notifications")
          .insert({
            user_id: parentComment.author_id,
            type: "new_comment" as const,
            title: `${commenterName} replied to your comment`,
            body: content.slice(0, 200),
            data: { post_id: id, comment_id: comment.id, parent_id },
          })
          .then(
            () => {},
            () => {}
          );

        // Send email notification to parent comment author
        const adminClient = createServiceClient();
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
    }

    return NextResponse.json({ comment: normalizedComment }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
