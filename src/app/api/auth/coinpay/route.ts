/**
 * CoinPay OAuth — Initiate login
 * GET /api/auth/coinpay → redirect to CoinPay authorization endpoint
 * DELETE /api/auth/coinpay → release this profile's CoinPay link
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getAppUrl } from "@/lib/app-url";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import {
  findBlockingPayout,
  findConnectedIdentity,
  logIdentityEvent,
} from "@/lib/coinpay-disconnect";

const COINPAY_AUTH_URL = "https://coinpayportal.com/api/oauth/authorize";

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "CoinPay OAuth not configured" }, { status: 500 });
  }

  const appUrl = getAppUrl(request, { trustedOnly: true });
  const redirectUri = `${appUrl}/api/callback/oauth`;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "connect" ? "connect" : "login";
  const requestedRedirect = searchParams.get("redirect");
  const returnTo =
    requestedRedirect && requestedRedirect.startsWith("/") ? requestedRedirect : "/settings/connections";
  let userId: string | null = null;

  if (mode === "connect") {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.redirect(`${appUrl}/login?redirect=${encodeURIComponent(returnTo)}`);
    }
    userId = auth.user.id;
  }

  // Generate state and PKCE
  const state = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: process.env.COINPAY_OAUTH_SCOPE || "openid profile email wallet:read",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${COINPAY_AUTH_URL}?${params}`;

  // Store state + verifier in cookie
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("coinpay_oauth_state", JSON.stringify({ state, codeVerifier, mode, userId, returnTo }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}

/**
 * DELETE /api/auth/coinpay — release this profile's CoinPay link (#537).
 *
 * One CoinPay account can be attached to exactly one ugig profile
 * (`UNIQUE(provider, provider_user_id)`), and there was no way to undo that
 * from either side: a profile that needed the identity for payouts could not
 * take it, and the profile holding it could not give it up. This is the give-up
 * half. The caller can only detach their own link — never another profile's —
 * and the link is frozen while a payout that depends on it is in flight.
 *
 * Deleting the row also destroys the stored access and refresh tokens, which is
 * the only revocation available: CoinPay publishes no token-revocation endpoint
 * (POST /api/oauth/revoke is a 404) and no OAuth discovery document.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const supabase = createServiceClient();

    const identity = await findConnectedIdentity(supabase, user.id);
    if (!identity) {
      return NextResponse.json(
        { error: "No CoinPay account is connected to this profile." },
        { status: 404 }
      );
    }

    const blocked = await findBlockingPayout(supabase, user.id);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 409 });
    }

    // Audit first, while the provider_user_id is still on the row.
    await logIdentityEvent(supabase, {
      userId: user.id,
      provider: "coinpay",
      providerUserId: identity.provider_user_id,
      event: "disconnected",
      email: identity.email,
      metadata: { source: "self_service" },
    });

    // oauth_identities is not in the generated database types, as at the other
    // call sites that touch it.
    const { error } = await (supabase as any)
      .from("oauth_identities")
      .delete()
      .eq("id", identity.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[CoinPay OAuth] disconnect failed:", error.message);
      return NextResponse.json(
        { error: "Could not disconnect CoinPay. Try again." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      disconnected: true,
      message:
        "CoinPay disconnected. That CoinPay account can now be connected to a different ugig profile.",
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
