import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { sendEmail, newFollowerEmail } from "@/lib/email";
import { getUserDid, onFollowed } from "@/lib/reputation-hooks";

// POST /api/users/[username]/follow — follow a user
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

    // Look up target user by username
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, full_name, did")
      .eq("username", username)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetProfile.id === user.id) {
      return NextResponse.json(
        { error: "You cannot follow yourself" },
        { status: 400 }
      );
    }

    // Insert follow record
    const { error: followError } = await supabase.from("follows").insert({
      follower_id: user.id,
      following_id: targetProfile.id,
    });

    if (followError) {
      // Unique constraint violation = already following
      if (followError.code === "23505") {
        return NextResponse.json(
          { error: "Already following this user" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: followError.message },
        { status: 400 }
      );
    }

    // Track reputation for following
    const userDid = await getUserDid(supabase, user.id);
    if (userDid && targetProfile.did) {
      onFollowed(userDid, targetProfile.did);
    }

    // Get follower's profile for notification
    const { data: followerProfile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .single();

    const followerName =
      followerProfile?.full_name || followerProfile?.username || "Someone";

    // Use service client for cross-user operations (notifications + email lookup)
    const adminClient = createServiceClient();

    // Create in-app notification (service client bypasses RLS)
    const { error: notifError } = await adminClient.from("notifications").insert({
      user_id: targetProfile.id,
      type: "new_follower",
      title: "New follower",
      body: `${followerName} started following you`,
      data: {
        follower_id: user.id,
        follower_username: followerProfile?.username,
      },
    });
    if (notifError) {
      console.error("Failed to create follow notification:", notifError);
    }

    // Send email notification to the followed user (fire and forget)
    const { data: targetAuth } = await adminClient.auth.admin.getUserById(
      targetProfile.id
    );
    const targetEmail = targetAuth?.user?.email;

    if (targetEmail) {
      const emailContent = newFollowerEmail({
        recipientName:
          targetProfile.full_name || targetProfile.username,
        followerName,
        followerUsername: followerProfile?.username || "",
      });
      void sendEmail({
        to: targetEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[username]/follow — unfollow a user
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

    // Look up target user by username
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", targetProfile.id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// GET /api/users/[username]/follow — check if current user follows this user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ following: false });
    }
    const { user, supabase } = auth;
    const { username } = await params;

    // Look up target user
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: follow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", targetProfile.id)
      .maybeSingle();

    return NextResponse.json({ following: !!follow });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
