import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postUpdateSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/posts/[id] - Get a single post
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: post, error } = await supabase
      .from("posts")
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          username,
          full_name,
          avatar_url,
          account_type,
          verified,
          verification_type,
          did
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Increment view count
    await supabase
      .from("posts")
      .update({ views_count: post.views_count + 1 })
      .eq("id", id);

    // Check if current user has voted
    let userVote: number | null = null;
    const auth = await getAuthContext(request);
    if (auth) {
      const { data: vote } = await supabase
        .from("post_votes")
        .select("vote_type")
        .eq("post_id", id)
        .eq("user_id", auth.user.id)
        .single();
      if (vote) {
        userVote = vote.vote_type;
      }
    }

    const baseUrl = request.nextUrl.origin;
    return NextResponse.json({
      post: { ...post, user_vote: userVote, permalink: `${baseUrl}/post/${post.id}` },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT /api/posts/[id] - Update a post
export async function PUT(
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

    // Check ownership
    const { data: existingPost } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", id)
      .single();

    if (!existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (existingPost.author_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = postUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data: post, error } = await supabase
      .from("posts")
      .update({
        ...validationResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          username,
          full_name,
          avatar_url,
          account_type,
          verified,
          verification_type,
          did
        )
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ post });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/posts/[id] - Delete a post
export async function DELETE(
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

    // Check ownership
    const { data: existingPost } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", id)
      .single();

    if (!existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (existingPost.author_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("posts").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Post deleted successfully" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
