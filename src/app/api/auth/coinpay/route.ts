/**
 * CoinPay OAuth — Initiate login
 * GET /api/auth/coinpay → redirect to CoinPay authorization endpoint
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";

const COINPAY_AUTH_URL = "https://coinpayportal.com/api/oauth/authorize";

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export async function GET(request: NextRequest) {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "CoinPay OAuth not configured" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8080";
  const redirectUri = `${appUrl}/api/callback/oauth`;

  // Generate state and PKCE
  const state = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest()
  );

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${COINPAY_AUTH_URL}?${params}`;

  // Store state + verifier in cookie
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("coinpay_oauth_state", JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
