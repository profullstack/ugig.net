import { NextRequest, NextResponse } from "next/server";
import { profileSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

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
    console.log("Profile update request body:", JSON.stringify(body, null, 2));

    const validationResult = profileSchema.safeParse(body);
    console.log("Validation result:", validationResult.success, validationResult.data);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    // Check if username is taken by another user
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", validationResult.data.username)
      .neq("id", user.id)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Check if profile is complete
    const isComplete = Boolean(
      validationResult.data.full_name &&
        validationResult.data.bio &&
        validationResult.data.skills.length > 0
    );

    const updateData = {
      ...validationResult.data,
      profile_completed: isComplete,
      updated_at: new Date().toISOString(),
    };
    console.log("Updating profile with wallet_addresses:", JSON.stringify(validationResult.data.wallet_addresses, null, 2));

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

    console.log("Profile saved, wallet_addresses:", JSON.stringify(profile?.wallet_addresses, null, 2));
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
