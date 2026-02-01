import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { postCommentUpdateSchema } from "@/lib/validations";

// PUT /api/posts/[id]/comments/[commentId] - Update a comment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Check comment exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from("post_comments")
      .select("id, author_id, post_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (existing.post_id !== id) {
      return NextResponse.json(
        { error: "Comment does not belong to this post" },
        { status: 400 }
      );
    }

    if (existing.author_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = postCommentUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data: comment, error } = await supabase
      .from("post_comments")
      .update({
        content: validationResult.data.content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
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

    const normalizedComment = {
      ...comment,
      author: Array.isArray(comment.author)
        ? comment.author[0]
        : comment.author,
    };

    return NextResponse.json({ comment: normalizedComment });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/posts/[id]/comments/[commentId] - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Check comment exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from("post_comments")
      .select("id, author_id, post_id")
      .eq("id", commentId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (existing.post_id !== id) {
      return NextResponse.json(
        { error: "Comment does not belong to this post" },
        { status: 400 }
      );
    }

    // Allow deletion by comment author or post owner
    if (existing.author_id !== user.id) {
      const { data: post } = await supabase
        .from("posts")
        .select("author_id")
        .eq("id", id)
        .single();

      if (!post || post.author_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from("post_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Comment deleted successfully" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
