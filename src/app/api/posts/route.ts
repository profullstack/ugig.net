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

    // Block banned/spam users from posting
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_spam" as any)
      .eq("id", user.id)
      .single();
    if ((profile as any)?.is_spam) {
      return NextResponse.json({ error: "Account suspended" }, { status: 403 });
    }

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
    const postType = data.poll_options?.length ? "poll" : data.url ? "link" : data.post_type || "text";

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

    // Create poll options if this is a poll
    if (postType === "poll" && data.poll_options?.length) {
      const options = data.poll_options.map((text, i) => ({
        post_id: post.id,
        text,
        position: i,
      }));
      await (supabase as any).from("poll_options").insert(options);
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
