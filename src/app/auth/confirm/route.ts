/**
 * GET /auth/confirm
 *
 * Email confirmation callback. Supabase redirects here after the user clicks
 * the confirmation link in their email. We exchange the token_hash server-side
 * and redirect to the app.
 *
 * Query params from Supabase:
 *   - token_hash: the OTP hash
 *   - type: "signup" | "email" | "recovery" | "invite"
 *   - redirect_to: optional post-confirm redirect (we ignore, use our own)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "signup" | "email" | "recovery" | "invite" | "magiclink" | null;
  const next = searchParams.get("next");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

  if (!tokenHash || !type) {
    // Missing params — redirect to login with error
    return NextResponse.redirect(`${appUrl}/login?error=invalid_confirmation_link`);
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type === "signup" ? "email" : type,
    });

    if (error) {
      console.error("[Auth Confirm] Verification failed:", error.message);
      return NextResponse.redirect(
        `${appUrl}/login?error=confirmation_failed&message=${encodeURIComponent(error.message)}`
      );
    }

    // Success — redirect based on type
    if (type === "recovery") {
      return NextResponse.redirect(`${appUrl}/reset-password`);
    }

    // Magic link (OAuth flow) — go to next or dashboard
    if (type === "magiclink" && next) {
      return NextResponse.redirect(`${appUrl}${next}`);
    }

    // Signup/email confirmation — go to login with success message
    return NextResponse.redirect(`${appUrl}/login?confirmed=true`);
  } catch (err) {
    console.error("[Auth Confirm] Error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=confirmation_error`);
  }
}
