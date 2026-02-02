import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/tags/[tag]/follow — check if current user follows this tag
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ following: false });
    }
    const { user, supabase } = auth;
    const { tag } = await params;
    const decodedTag = decodeURIComponent(tag);

    const { data } = await supabase
      .from("tag_follows")
      .select("id")
      .eq("user_id", user.id)
      .eq("tag", decodedTag)
      .maybeSingle();

    return NextResponse.json({ following: !!data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/tags/[tag]/follow — follow a tag
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { tag } = await params;
    const decodedTag = decodeURIComponent(tag);

    const { error } = await supabase.from("tag_follows").insert({
      user_id: user.id,
      tag: decodedTag,
    });

    if (error) {
      // Unique constraint violation = already following
      if (error.code === "23505") {
        return NextResponse.json({ following: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ following: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/tags/[tag]/follow — unfollow a tag
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { tag } = await params;
    const decodedTag = decodeURIComponent(tag);

    const { error } = await supabase
      .from("tag_follows")
      .delete()
      .eq("user_id", user.id)
      .eq("tag", decodedTag);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ following: false });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
