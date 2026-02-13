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
      .select("username, full_name, account_type")
      .eq("id", userId)
      .single();

    const name = profile?.full_name || profile?.username || "there";
    const accountType = profile?.account_type || "human";

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
