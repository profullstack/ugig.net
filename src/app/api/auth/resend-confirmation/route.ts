import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { z } from "zod";

const resendSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(request: NextRequest) {
  try {
    const identifier = getRateLimitIdentifier(request);
    const rl = checkRateLimit(identifier, "auth");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const validationResult = resendSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email } = validationResult.data;
    const supabase = await createClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      console.error("Resend confirmation error:", error.message);
      // Don't leak whether the email exists
      return NextResponse.json({
        message: "If an account exists with that email, a confirmation link has been sent.",
      });
    }

    return NextResponse.json({
      message: "If an account exists with that email, a confirmation link has been sent.",
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
