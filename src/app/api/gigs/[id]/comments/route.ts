import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { gigCommentSchema } from "@/lib/validations";
import { sendEmail, newGigCommentEmail, newGigCommentReplyEmail } from "@/lib/email";
import { getUserDid, onCommentCreated } from "@/lib/reputation-hooks";
import { logActivity } from "@/lib/activity";

// GET /api/gigs/[id]/comments - List comments for a gig
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify gig exists
    const { data: gig, error: gigError } = await supabase
      .from("gigs")
      .select("id")
      .eq("id", id)
      .single();

    if (gigError || !gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Fetch all comments for this gig with author info
    const { data: comments, error } = await supabase
      .from("gig_comments")
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
      .eq("gig_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Organize into threads: top-level comments with nested replies
    const topLevel = (comments || []).filter((c) => !c.parent_id);
    const replies = (comments || []).filter((c) => c.parent_id);

    const threads = topLevel.map((comment) => ({
      ...comment,
      author: Array.isArray(comment.author) ? comment.author[0] : comment.author,
      replies: replies
        .filter((r) => r.parent_id === comment.id)
        .map((r) => ({
          ...r,
          author: Array.isArray(r.author) ? r.author[0] : r.author,
        })),
    }));

    return NextResponse.json({ comments: threads, total: comments?.length || 0 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/gigs/[id]/comments - Create a comment
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
    const validationResult = gigCommentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content, parent_id } = validationResult.data;

    // Verify gig exists and get poster info for notification
    const { data: gig, error: gigError } = await supabase
      .from("gigs")
      .select(
        `
        id,
        title,
        poster_id,
        poster:profiles!poster_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `
      )
      .eq("id", id)
      .single();

    if (gigError || !gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // If replying, verify parent exists and belongs to this gig
    // Also enforce one level of nesting (parent must be a top-level comment)
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from("gig_comments")
        .select("id, gig_id, parent_id, author_id")
        .eq("id", parent_id)
        .single();

      if (parentError || !parentComment) {
        return NextResponse.json(
          { error: "Parent comment not found" },
          { status: 404 }
        );
      }

      if (parentComment.gig_id !== id) {
        return NextResponse.json(
          { error: "Parent comment belongs to a different gig" },
          { status: 400 }
        );
      }

      if (parentComment.parent_id) {
        return NextResponse.json(
          { error: "Cannot reply to a reply. Only one level of nesting is allowed." },
          { status: 400 }
        );
      }
    }

    // Create the comment
    const { data: comment, error } = await supabase
      .from("gig_comments")
      .insert({
        gig_id: id,
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
      author: Array.isArray(comment.author) ? comment.author[0] : comment.author,
    };

    // Get the comment author's profile for notifications
    const { data: authorProfile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();

    const authorName =
      authorProfile?.full_name || authorProfile?.username || "Someone";

    // Send notifications (fire and forget)
    const poster = Array.isArray(gig.poster) ? gig.poster[0] : gig.poster;

    if (parent_id) {
      // Reply to a comment — notify the original commenter
      const { data: parentComment } = await supabase
        .from("gig_comments")
        .select("author_id")
        .eq("id", parent_id)
        .single();

      if (parentComment && parentComment.author_id !== user.id) {
        // Get parent comment author's email
        const { data: parentAuthorAuth } = await supabase.auth.admin.getUserById(
          parentComment.author_id
        );

        // Create in-app notification
        void supabase
          .from("notifications")
          .insert({
            user_id: parentComment.author_id,
            type: "new_comment" as const,
            title: `${authorName} replied to your comment`,
            body: content.slice(0, 200),
            data: { gig_id: id, comment_id: comment.id, parent_id },
          })
          .then(() => {}, () => {});

        // Send email notification
        if (parentAuthorAuth?.user?.email) {
          const { data: parentAuthorProfile } = await supabase
            .from("profiles")
            .select("full_name, username")
            .eq("id", parentComment.author_id)
            .single();
          const recipientName =
            parentAuthorProfile?.full_name || parentAuthorProfile?.username || "there";
          const emailContent = newGigCommentReplyEmail({
            recipientName,
            replierName: authorName,
            gigTitle: gig.title,
            gigId: id,
            replyPreview: content,
          });
          void sendEmail({
            to: parentAuthorAuth.user.email,
            ...emailContent,
          });
        }
      }
    } else {
      // New top-level question — notify the gig owner
      if (gig.poster_id !== user.id) {
        // Get poster's email from auth
        const { data: posterAuth } = await supabase.auth.admin.getUserById(
          gig.poster_id
        );

        // Create in-app notification
        void supabase
          .from("notifications")
          .insert({
            user_id: gig.poster_id,
            type: "new_comment" as const,
            title: `New question on "${gig.title}"`,
            body: content.slice(0, 200),
            data: { gig_id: id, comment_id: comment.id },
          })
          .then(() => {}, () => {});

        // Send email notification
        if (posterAuth?.user?.email) {
          const posterName =
            poster?.full_name || poster?.username || "there";
          const emailContent = newGigCommentEmail({
            posterName,
            commenterName: authorName,
            gigTitle: gig.title,
            gigId: id,
            commentPreview: content,
          });
          void sendEmail({
            to: posterAuth.user.email,
            ...emailContent,
          });
        }
      }
    }

    // Fire reputation receipt
    const userDid = await getUserDid(supabase, user.id);
    if (userDid) {
      onCommentCreated(userDid, comment.id);
    }

    // Log activity
    void logActivity(supabase, {
      userId: user.id,
      activityType: "comment_posted",
      referenceId: id,
      referenceType: "gig",
      metadata: { comment_preview: content.slice(0, 100) },
    });

    return NextResponse.json({ comment: normalizedComment }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
