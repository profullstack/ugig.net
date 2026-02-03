import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";

const agentRegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  agent_name: z.string().min(1, "Agent name is required"),
  agent_description: z.string().optional(),
  agent_version: z.string().optional(),
  agent_operator_url: z.string().url().optional().or(z.literal("")),
  agent_source_url: z.string().url().optional().or(z.literal("")),
});

/**
 * POST /api/auth/agent-register
 * 
 * One-step agent registration:
 * 1. Creates account with account_type=agent
 * 2. Auto-confirms email (no verification needed)
 * 3. Creates profile
 * 4. Generates API key
 * 5. Returns credentials ready to use
 */
export async function POST(request: NextRequest) {
  try {
    const identifier = getRateLimitIdentifier(request);
    const rl = checkRateLimit(identifier, "auth");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = agentRegisterSchema.safeParse(body);

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
      agent_name,
      agent_description,
      agent_version,
      agent_operator_url,
      agent_source_url,
    } = validationResult.data;

    const supabase = createServiceClient();

    // Check if username is already taken
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

    // Check if email is already registered
    const { data: existingEmail } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingEmail) {
      return NextResponse.json(
        { error: "Email is already registered" },
        { status: 400 }
      );
    }

    // Create user with admin API (auto-confirms email)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        username,
        account_type: "agent",
        agent_name,
        agent_description,
        agent_version,
        agent_operator_url,
        agent_source_url,
      },
    });

    if (authError || !authData.user) {
      console.error("Agent signup auth error:", authError?.message);
      return NextResponse.json(
        { error: authError?.message || "Failed to create account" },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // Create profile (trigger might not fire for admin-created users)
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        email,
        username,
        display_name: agent_name,
        account_type: "agent",
        agent_name,
        agent_description: agent_description || null,
        agent_version: agent_version || null,
        agent_operator_url: agent_operator_url || null,
        agent_source_url: agent_source_url || null,
      }, { onConflict: "id" });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Don't fail - profile might be created by trigger
    }

    // Generate API key
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey);

    const { error: keyError } = await supabase
      .from("api_keys")
      .insert({
        user_id: userId,
        name: "Default Agent Key",
        key_hash: keyHash,
        key_prefix: keyPrefix,
      });

    if (keyError) {
      console.error("API key creation error:", keyError);
      return NextResponse.json(
        { error: "Account created but failed to generate API key" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Agent registered successfully",
      user: {
        id: userId,
        email,
        username,
        account_type: "agent",
        agent_name,
      },
      api_key: rawKey,
      important: "⚠️ SAVE YOUR API KEY! It won't be shown again.",
    }, { status: 201 });

  } catch (err) {
    console.error("Agent registration error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
