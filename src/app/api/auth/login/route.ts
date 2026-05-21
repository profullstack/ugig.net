import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { safeParseBody } from "@/lib/sanitize";

export async function POST(request: NextRequest) {
  try {
    const identifier = getRateLimitIdentifier(request);
    const rl = checkRateLimit(identifier, "auth");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await safeParseBody(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Block login for users who haven't confirmed their email
    if (data.user && !data.user.email_confirmed_at) {
      // Sign them out since they shouldn't have a session
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error: "Please confirm your email before logging in. Check your inbox for a confirmation link.",
          code: "EMAIL_NOT_CONFIRMED",
        },
        { status: 403 }
      );
    }

    // Return only tokens, not the full session object (#82)
    return NextResponse.json({
      message: "Login successful",
      user: data.user,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
