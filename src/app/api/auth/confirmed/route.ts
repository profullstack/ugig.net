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
import { timingSafeEqual } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { generateAndStoreDid } from "@/lib/auth/did";
import { createUserLnWallet } from "@/lib/lightning/create-wallet";
import { safeParseBody } from "@/lib/sanitize";

type AuthWebhookPayload = {
  type?: string;
  record?: {
    email_confirmed_at?: string | null;
    id?: string;
    email?: string;
  };
  old_record?: {
    email_confirmed_at?: string | null;
  };
};

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  try {
    // Verify the webhook secret to prevent unauthorized calls
    const authHeader = request.headers.get("authorization") || "";
    const webhookSecret = process.env.AUTH_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("AUTH_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    if (!safeCompare(authHeader, `Bearer ${webhookSecret}`) && !safeCompare(authHeader, webhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await safeParseBody<AuthWebhookPayload>(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

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

    // Use service client — this is called by a DB webhook, no user session
    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, full_name, account_type, did")
      .eq("id", userId)
      .single();

    const name = profile?.full_name || profile?.username || "there";
    const accountType = profile?.account_type || "human";

    // Auto-generate a DID for the user if they don't have one
    // (may already exist if generated at signup)
    if (!profile?.did) {
      try {
        const did = await generateAndStoreDid(supabase, userId, email);
        if (did) {
          console.log(`[Auth Confirmed] DID claimed for ${email}: ${did}`);
        }
      } catch (didErr) {
        // Non-fatal — don't block signup if DID claim fails
        console.error("[Auth Confirmed] DID claim failed:", didErr);
      }
    }

    // Auto-create Lightning wallet for the user
    const username = profile?.username;
    if (username) {
      try {
        const lnWallet = await createUserLnWallet(username, supabase, userId);
        if (lnWallet?.ln_address) {
          await supabase
            .from("profiles")
            .update({ ln_address: lnWallet.ln_address } as any)
            .eq("id", userId);
          console.log(`[Auth Confirmed] LN wallet created for ${username}: ${lnWallet.ln_address}`);
        }
      } catch (lnErr) {
        // Non-fatal — don't block signup if LN wallet creation fails
        console.error("[Auth Confirmed] LN wallet creation failed:", lnErr);
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

    // ── Referral reward: 25 sats each on account activation ──
    try {
      const { data: referral } = await (supabase as any)
        .from("referrals")
        .select("referrer_id, reward_paid")
        .eq("referred_user_id", userId)
        .eq("status", "registered")
        .maybeSingle();

      if (referral && !referral.reward_paid) {
        const REFERRAL_REWARD = 25;
        const referrerId = referral.referrer_id;

        // Credit referrer
        const { data: referrerWallet } = await (supabase as any)
          .from("wallets")
          .select("balance_sats")
          .eq("user_id", referrerId)
          .single();

        if (referrerWallet) {
          await (supabase as any).from("wallets")
            .update({ balance_sats: referrerWallet.balance_sats + REFERRAL_REWARD, updated_at: new Date().toISOString() })
            .eq("user_id", referrerId);
        } else {
          await (supabase as any).from("wallets")
            .insert({ user_id: referrerId, balance_sats: REFERRAL_REWARD });
        }

        await (supabase as any).from("wallet_transactions").insert({
          user_id: referrerId,
          type: "deposit",
          amount_sats: REFERRAL_REWARD,
          balance_after: (referrerWallet?.balance_sats ?? 0) + REFERRAL_REWARD,
          status: "completed",
          reference_id: userId,
        });

        // Credit new user
        const { data: newUserWallet } = await (supabase as any)
          .from("wallets")
          .select("balance_sats")
          .eq("user_id", userId)
          .single();

        if (newUserWallet) {
          await (supabase as any).from("wallets")
            .update({ balance_sats: newUserWallet.balance_sats + REFERRAL_REWARD, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        } else {
          await (supabase as any).from("wallets")
            .insert({ user_id: userId, balance_sats: REFERRAL_REWARD });
        }

        await (supabase as any).from("wallet_transactions").insert({
          user_id: userId,
          type: "deposit",
          amount_sats: REFERRAL_REWARD,
          balance_after: (newUserWallet?.balance_sats ?? 0) + REFERRAL_REWARD,
          status: "completed",
          reference_id: referrerId,
        });

        // Mark reward as paid
        await (supabase as any).from("referrals")
          .update({ reward_paid: true })
          .eq("referred_user_id", userId)
          .eq("referrer_id", referrerId);

        // Notify referrer
        await (supabase as any).from("notifications").insert({
          user_id: referrerId,
          type: "referral_reward",
          title: "Referral reward! \u{1F389}",
          body: `${name || email} activated their account! You both earned ${REFERRAL_REWARD} sats.`,
          data: { amount_sats: REFERRAL_REWARD, referred_user_id: userId },
        });

        console.log(`[Auth Confirmed] Referral reward: ${REFERRAL_REWARD} sats each to ${referrerId} and ${userId}`);
      }
    } catch (rewardErr) {
      console.error("[Auth Confirmed] Referral reward failed (non-fatal):", rewardErr);
    }

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("[Auth Confirmed] Error:", err);
    return NextResponse.json(
      { error: "Failed to process confirmation" },
      { status: 500 }
    );
  }
}

// DID generation is now in @/lib/auth/did.ts (shared with signup route)
