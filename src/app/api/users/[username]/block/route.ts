import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// POST /api/users/[username]/block — block a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { username } = await params;

    let reason: string | null = null;
    try {
      const body = await request.json();
      if (typeof body?.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim().slice(0, 500);
      }
    } catch {
      // Body is optional.
    }

    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetProfile.id === user.id) {
      return NextResponse.json(
        { error: "You cannot block yourself" },
        { status: 400 }
      );
    }

    const { error: blockError } = await supabase.from("user_blocks").insert({
      blocker_id: user.id,
      blocked_id: targetProfile.id,
      reason,
    });

    if (blockError) {
      // Unique violation — already blocked, so the caller already has what it
      // asked for.
      if (blockError.code === "23505") {
        return NextResponse.json({ success: true, blocked: true });
      }
      return NextResponse.json({ error: blockError.message }, { status: 400 });
    }

    // The database trigger drops follows in both directions; nothing else to
    // unwind here.
    return NextResponse.json({ success: true, blocked: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[username]/block — unblock a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { username } = await params;

    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetProfile.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, blocked: false });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// GET /api/users/[username]/block — has the current user blocked this user?
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ blocked: false });
    }
    const { user, supabase } = auth;
    const { username } = await params;

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: block } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetProfile.id)
      .maybeSingle();

    return NextResponse.json({ blocked: !!block });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
