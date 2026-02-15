/**
 * POST /api/auth/confirmed
 *
 * Webhook called when a user confirms their email.
 * Triggered by Supabase Auth hook (after email verification).
 *
 * Sends the welcome/onboarding email with instructions for:
 * - Uploading avatar and banner images
 * - Adding skills and AI tools
 * - CLI usage (npx ugig)
 *
 * Differentiates between human and agent accounts.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { generateKeyPairSync } from "crypto";

export async function POST(request: NextRequest) {
  try {
    // Verify the webhook secret to prevent unauthorized calls
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.AUTH_WEBHOOK_SECRET;

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Supabase auth webhook payload
    const { type, record } = body;

    // Only handle user confirmation events
    if (type !== "UPDATE" && type !== "INSERT") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Check if this is an email confirmation (email_confirmed_at was just set)
    const emailConfirmedAt = record?.email_confirmed_at;
    const oldRecord = body.old_record;

    // Skip if email was already confirmed (not a new confirmation)
    if (oldRecord?.email_confirmed_at && emailConfirmedAt) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_confirmed" });
    }

    // Skip if email is not confirmed
    if (!emailConfirmedAt) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not_confirmed" });
    }

    const userId = record?.id;
    const email = record?.email;

    if (!userId || !email) {
      return NextResponse.json({ error: "Missing user data" }, { status: 400 });
    }

    // Get the user's profile to determine account type and name
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, full_name, account_type, did")
      .eq("id", userId)
      .single();

    const name = profile?.full_name || profile?.username || "there";
    const accountType = profile?.account_type || "human";

    // Auto-generate a DID for the user if they don't have one
    if (!profile?.did) {
      try {
        const did = await generateAndClaimDid(supabase, userId);
        if (did) {
          console.log(`[Auth Confirmed] DID claimed for ${email}: ${did}`);
        }
      } catch (didErr) {
        // Non-fatal — don't block signup if DID claim fails
        console.error("[Auth Confirmed] DID claim failed:", didErr);
      }
    }

    // Send the welcome/onboarding email
    const welcome = welcomeEmail({ name, accountType });
    const result = await sendEmail({
      to: email,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
    });

    console.log(`[Auth Confirmed] Welcome email sent to ${email} (${accountType})`, result);

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("[Auth Confirmed] Error:", err);
    return NextResponse.json(
      { error: "Failed to process confirmation" },
      { status: 500 }
    );
  }
}

/**
 * Generate a did:key (ed25519), store on profile, and claim on CoinPayPortal
 */
function base58btcEncode(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  const result: string[] = [];
  while (num > 0n) {
    const mod = Number(num % 58n);
    result.unshift(ALPHABET[mod]);
    num = num / 58n;
  }
  for (const b of bytes) {
    if (b === 0) result.unshift("1");
    else break;
  }
  return result.join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateAndClaimDid(supabase: any, userId: string): Promise<string | null> {
  // Generate ed25519 keypair
  const { publicKey: pubKeyObj } = generateKeyPairSync("ed25519");
  const pubKeyRaw = pubKeyObj.export({ type: "spki", format: "der" }).subarray(-32);

  // Build did:key with ed25519 multicodec prefix (0xed01)
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), pubKeyRaw]);
  const did = `did:key:z${base58btcEncode(multicodec)}`;

  // Store DID on the ugig profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ did })
    .eq("id", userId);

  if (updateError) {
    console.error("[Auth Confirmed] Failed to store DID on profile:", updateError);
    return null;
  }

  // Submit an initial reputation action so the DID is known to CoinPayPortal
  const { submitReputationAction } = await import("@/lib/reputation");
  await submitReputationAction({
    agent_did: did,
    action_category: "identity.profile_update",
    action_type: "email_confirmed",
    metadata: { platform: "ugig.net" },
  });

  return did;
}
