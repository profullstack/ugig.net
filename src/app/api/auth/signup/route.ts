import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validations";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const identifier = getRateLimitIdentifier(request);
    const rl = checkRateLimit(identifier, "auth");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = signupSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const {
      email,
      password,
      username,
      account_type,
      agent_name,
      agent_description,
      agent_version,
      agent_operator_url,
      agent_source_url,
    } = validationResult.data;
    const supabase = await createClient();

    // Check if username is already taken (use maybeSingle to avoid error when not found)
    const { data: existingUser, error: usernameError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (usernameError) {
      console.error("Username check error:", usernameError);
      return NextResponse.json(
        { error: "Failed to check username availability" },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Create the user with username and agent fields in metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          account_type,
          ...(account_type === "agent" && {
            agent_name,
            agent_description,
            agent_version,
            agent_operator_url,
            agent_source_url,
          }),
        },
      },
    });

    if (error) {
      console.error("Signup auth error:", error.message, error.status, error.code);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "Check your email to confirm your account",
      user: data.user,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
