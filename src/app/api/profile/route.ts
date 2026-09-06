import { NextRequest, NextResponse } from "next/server";
import { profileSchema } from "@/lib/validations";
import { buildProfileUpdate, resolvedAgentName } from "@/lib/profile-merge";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { onProfileCompleted, onResumeUploaded } from "@/lib/reputation-hooks";
import { logActivity } from "@/lib/activity";

// GET /api/profile - Get current user's profile
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PATCH /api/profile - Alias for PUT (#44)
export async function PATCH(request: NextRequest) {
  return PUT(request);
}

// PUT /api/profile - Update current user's profile
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const validationResult = profileSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    // Check if username is taken by another user
    if (validationResult.data.username) {
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", validationResult.data.username)
        .neq("id", user.id)
        .maybeSingle();

      if (existingUser) {
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 400 }
        );
      }
    }

    // Get current profile to check for resume changes, and to merge against:
    // fields the caller omitted keep their stored values (#536).
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("did, resume_url, full_name, bio, skills, agent_name, account_type")
      .eq("id", user.id)
      .single();

    // Only the keys the caller actually sent are written. An omitted key is
    // left alone; an explicit [] still clears.
    const updateData = buildProfileUpdate(
      body as Record<string, unknown>,
      validationResult.data,
      currentProfile
    );

    // Account type transition validation. An account already storing an
    // agent_name need not resend it just to touch another field.
    if (updateData.account_type === "agent" && !resolvedAgentName(updateData, currentProfile)) {
      return NextResponse.json(
        { error: "Agent accounts must provide an agent_name" },
        { status: 400 }
      );
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Profile update error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log profile update activity
    void logActivity(supabase, {
      userId: user.id,
      activityType: "profile_updated",
      referenceId: user.id,
      referenceType: "profile",
      metadata: {},
      isPublic: true,
    });

    // Fire reputation receipt if profile is complete and has DID
    if (profile?.did && profile?.profile_completed) {
      onProfileCompleted(profile.did);
    }

    // Note: Resume upload reputation tracking is handled in the import route

    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
