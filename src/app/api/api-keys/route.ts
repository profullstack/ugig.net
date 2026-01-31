import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createApiKeySchema } from "@/lib/validations";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";
import { checkRateLimit, rateLimitExceeded, addRateLimitHeaders, getRateLimitIdentifier } from "@/lib/rate-limit";

// GET /api/api-keys - List user's API keys
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "read");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, last_used_at, expires_at, created_at, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return addRateLimitHeaders(NextResponse.json({ keys }), rl);
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/api-keys - Create a new API key
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = createApiKeySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, expires_at } = validationResult.data;

    // Check if user already has a key with this name
    const { data: existingKey } = await supabase
      .from("api_keys")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", name)
      .is("revoked_at", null)
      .maybeSingle();

    if (existingKey) {
      return NextResponse.json(
        { error: "You already have an active API key with this name" },
        { status: 400 }
      );
    }

    // Generate and hash the key
    const rawKey = generateApiKey();
    const keyHash = await hashApiKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey);

    const { data: apiKey, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: user.id,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        expires_at: expires_at || null,
      })
      .select("id, name, key_prefix, created_at, expires_at")
      .single();

    if (error) {
      console.error("API key creation error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Return the full key only once at creation
    return NextResponse.json(
      {
        ...apiKey,
        key: rawKey,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
