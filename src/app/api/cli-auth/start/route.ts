import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

// Headless CLI login — step 1. The CLI POSTs here (unauthenticated) to create a
// pending device_codes row, and gets back a URL + short user code to show the
// user, plus a device_code secret it polls with. See /api/cli-auth/poll.

const EXPIRES_IN = 600; // seconds (10 min)
const INTERVAL = 5; // seconds between polls
// Crockford-ish alphabet: no 0/O/1/I/L to avoid confusion when typing the code.
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeUserCode(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function POST(request: NextRequest) {
  try {
    let body: { scope?: string; client_name?: string } = {};
    try { body = await request.json(); } catch { /* empty body is fine */ }
    const scope = body?.scope === "public" ? "public" : "full";
    const clientName =
      typeof body?.client_name === "string" ? body.client_name.slice(0, 100) : null;

    const supabase = createServiceClient();
    const deviceCode = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + EXPIRES_IN * 1000).toISOString();

    // device_codes isn't in the generated Database types yet, so use a loose
    // handle for it (same pattern as oauth_identities elsewhere).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // Insert, retrying on the tiny chance of a user_code collision.
    let created = false;
    let userCode = makeUserCode();
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const { error } = await db
        .from("device_codes")
        .insert({
          device_code: deviceCode,
          user_code: userCode,
          scope,
          client_name: clientName,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (!error) created = true;
      else userCode = makeUserCode();
    }
    if (!created) {
      return NextResponse.json({ error: "Failed to start device authorization" }, { status: 500 });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const verificationUri = `${base}/cli-auth`;
    return NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
      expires_in: EXPIRES_IN,
      interval: INTERVAL,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
