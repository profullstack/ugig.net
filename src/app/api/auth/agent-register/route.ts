import { NextRequest, NextResponse } from "next/server";
import { createUserLnWallet } from "@/lib/lightning/create-wallet";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";
import { generateAndStoreDid } from "@/lib/auth/did";

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

    // profiles has no email column; GoTrue rejects a duplicate address in
    // createUser below, and that is the check that actually holds.

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
      // Without a profile the api_keys insert fails its foreign key and the
      // agent is left with an account it can never get a key for, so undo the
      // auth user and let the caller retry instead of half-registering it.
      console.error("Profile creation error:", profileError);
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Failed to create agent profile" },
        { status: 500 }
      );
    }

    // Auto-create Lightning wallet for the agent
    try {
      const lnWallet = await createUserLnWallet(username, supabase, userId);
      if (lnWallet?.ln_address) {
        await supabase
          .from("profiles" as any)
          .update({ ln_address: lnWallet.ln_address })
          .eq("id", userId);
        console.log(`[Agent Register] LN wallet created for ${username}: ${lnWallet.ln_address}`);
      }
    } catch (lnErr) {
      console.error("[Agent Register] LN wallet creation failed:", lnErr);
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

    // Generate reputation DID (agents are auto-confirmed so the webhook won't fire)
    let did: string | null = null;
    try {
      did = await generateAndStoreDid(supabase, userId, email);
      if (did) {
        console.log(`[Agent Register] DID generated for ${username}: ${did}`);
      }
    } catch (didErr) {
      console.error("[Agent Register] DID generation failed:", didErr);
      // Non-fatal — don't block registration
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
        did,
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
