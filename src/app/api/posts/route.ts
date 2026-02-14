import { NextRequest, NextResponse } from "next/server";
import { postSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { getUserDid, onPostCreated } from "@/lib/reputation-hooks";
import { logActivity } from "@/lib/activity";

// POST /api/posts - Create a new post
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = postSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Determine post_type from content
    const postType = data.url ? "link" : data.post_type || "text";

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        content: data.content,
        url: data.url || null,
        post_type: postType,
        tags: data.tags || [],
      })
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

    // Fire reputation receipt
    getUserDid(supabase, user.id).then((did) => {
      if (did) onPostCreated(did, post.id);
    }).catch(() => {});

    // Log activity
    void logActivity(supabase, {
      userId: user.id,
      activityType: "post_created",
      referenceId: post.id,
      referenceType: "post",
      metadata: { content_preview: data.content.slice(0, 100) },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
