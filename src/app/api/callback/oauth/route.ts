/**
 * CoinPay OAuth Callback
 * GET /api/auth/coinpay/callback?code=...&state=...
 *
 * Exchanges code for tokens, fetches userinfo, finds/creates user,
 * establishes Supabase session via magic link.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { logIdentityEvent } from "@/lib/coinpay-disconnect";

const TOKEN_URL = "https://coinpayportal.com/api/oauth/token";
const USERINFO_URL = "https://coinpayportal.com/api/oauth/userinfo";

type CoinPayOAuthState = {
  state: string;
  codeVerifier: string;
  mode?: "login" | "connect";
  userId?: string | null;
  returnTo?: string;
};

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function coinpayIdentityMetadata(
  tokens: Record<string, unknown>,
  userinfo: Record<string, unknown>
) {
  return {
    name: typeof userinfo.name === "string" ? userinfo.name : null,
    coinpay_sub: typeof userinfo.sub === "string" ? userinfo.sub : null,
    access_token: typeof tokens.access_token === "string" ? tokens.access_token : null,
    refresh_token: typeof tokens.refresh_token === "string" ? tokens.refresh_token : null,
    token_type: typeof tokens.token_type === "string" ? tokens.token_type : null,
    scope: typeof tokens.scope === "string" ? tokens.scope : null,
    expires_at:
      typeof tokens.expires_in === "number"
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
    connected_at: new Date().toISOString(),
  };
}

function redirectWithClearedState(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.delete("coinpay_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl(request, { trustedOnly: true });
  const loginUrl = `${appUrl}/login`;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      console.error("[CoinPay OAuth] Authorization error:", error);
      return NextResponse.redirect(`${loginUrl}?error=coinpay_denied`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${loginUrl}?error=coinpay_missing_params`);
    }

    // Validate state
    const stateCookie = request.cookies.get("coinpay_oauth_state")?.value;
    if (!stateCookie) {
      return NextResponse.redirect(`${loginUrl}?error=coinpay_expired`);
    }

    let savedState: CoinPayOAuthState;
    try {
      savedState = JSON.parse(stateCookie);
    } catch {
      return NextResponse.redirect(`${loginUrl}?error=coinpay_expired`);
    }

    if (savedState.state !== state) {
      return NextResponse.redirect(`${loginUrl}?error=coinpay_state_mismatch`);
    }

    // Exchange code for tokens
    const redirectUri = `${appUrl}/api/callback/oauth`;
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.COINPAY_OAUTH_CLIENT_ID!,
        client_secret: process.env.COINPAY_OAUTH_CLIENT_SECRET!,
        code_verifier: savedState.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[CoinPay OAuth] Token exchange failed:", tokenRes.status, errBody);
      return NextResponse.redirect(`${loginUrl}?error=coinpay_token_failed`);
    }

    const tokens = await tokenRes.json();

    // Fetch userinfo
    const userinfoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
      console.error("[CoinPay OAuth] Userinfo failed:", userinfoRes.status);
      return NextResponse.redirect(`${loginUrl}?error=coinpay_userinfo_failed`);
    }

    const userinfo = await userinfoRes.json();
    const { sub, email, name } = userinfo;
    const identityMetadata = coinpayIdentityMetadata(tokens, userinfo);

    if (!email) {
      return NextResponse.redirect(`${loginUrl}?error=coinpay_no_email`);
    }

    const supabase = getAdminSupabase();

    if (savedState.mode === "connect") {
      const returnTo = savedState.returnTo?.startsWith("/")
        ? savedState.returnTo
        : "/settings/connections";
      const connectUrl = `${appUrl}${returnTo}`;

      if (!savedState.userId) {
        return redirectWithClearedState(`${connectUrl}?coinpay=expired`);
      }

      const { data: existingIdentity } = await supabase
        .from("oauth_identities")
        .select("id, user_id")
        .eq("provider", "coinpay")
        .eq("provider_user_id", sub)
        .maybeSingle();

      if (existingIdentity && existingIdentity.user_id !== savedState.userId) {
        // Name the profile that holds the link (#537). "already_linked" alone
        // was a dead end: the owner could not tell which of their profiles had
        // claimed it, so they had no way to go and release it. The caller has
        // just completed an authorization for this exact CoinPay account, so
        // they have proven they own the identity — and a ugig username is
        // public regardless.
        const { data: holder } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", existingIdentity.user_id)
          .maybeSingle();

        void logIdentityEvent(supabase, {
          userId: savedState.userId,
          provider: "coinpay",
          providerUserId: sub,
          event: "link_rejected",
          email,
          metadata: { held_by_user_id: existingIdentity.user_id },
        });

        const holderParam = holder?.username
          ? `&linked_to=${encodeURIComponent(holder.username)}`
          : "";
        return redirectWithClearedState(`${connectUrl}?coinpay=already_linked${holderParam}`);
      }

      if (existingIdentity) {
        await supabase
          .from("oauth_identities")
          .update({
            email,
            metadata: identityMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingIdentity.id);
      } else {
        await supabase.from("oauth_identities").insert({
          user_id: savedState.userId,
          provider: "coinpay",
          provider_user_id: sub,
          email,
          metadata: identityMetadata,
        });
      }

      void logIdentityEvent(supabase, {
        userId: savedState.userId,
        provider: "coinpay",
        providerUserId: sub,
        event: existingIdentity ? "reconnected" : "connected",
        email,
      });

      return redirectWithClearedState(`${connectUrl}?coinpay=connected`);
    }

    // Check if this CoinPay identity is already linked
    const { data: existingIdentity } = await supabase
      .from("oauth_identities")
      .select("id, user_id")
      .eq("provider", "coinpay")
      .eq("provider_user_id", sub)
      .single();

    let userId: string;

    if (existingIdentity) {
      // Existing linked user
      userId = existingIdentity.user_id;
      await supabase
        .from("oauth_identities")
        .update({
          email,
          metadata: identityMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIdentity.id);
    } else {
      // Try to create user first; if email exists, look them up
      const randomPassword = randomBytes(32).toString("hex");
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: name, oauth_provider: "coinpay" },
      });

      if (createErr) {
        if (
          (createErr as any).code === "email_exists" ||
          createErr.message?.includes("already been registered")
        ) {
          // User exists — find them via listUsers with page iteration
          let existingUser: any = null;
          let page = 1;
          while (!existingUser) {
            const {
              data: { users },
            } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
            if (!users || users.length === 0) break;
            existingUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
            page++;
          }
          if (!existingUser) {
            console.error("[CoinPay OAuth] User exists but couldn't find by email:", email);
            return NextResponse.redirect(
              `${loginUrl}?error=coinpay_create_failed&detail=user_lookup_failed`
            );
          }
          userId = existingUser.id;
        } else {
          console.error("[CoinPay OAuth] Failed to create user:", createErr?.message);
          return NextResponse.redirect(
            `${loginUrl}?error=coinpay_create_failed&detail=${encodeURIComponent(createErr?.message || "unknown")}`
          );
        }
      } else {
        userId = newUser.user!.id;

        // Create profile for new user
        const username = generateUsername(email, name);
        await supabase.from("profiles").insert({
          id: userId,
          username,
          full_name: name || null,
          profile_completed: false,
        });

        // Send welcome email with password setup link
        try {
          const { data: resetLink } = await supabase.auth.admin.generateLink({
            type: "recovery",
            email,
          });
          const resetUrl = resetLink?.properties?.hashed_token
            ? `${appUrl}/auth/confirm?token_hash=${resetLink.properties.hashed_token}&type=recovery&next=/reset-password`
            : `${appUrl}/forgot-password`;

          await sendEmail({
            to: email,
            subject: "Welcome to ugig.net — Set your password",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Welcome to ugig.net${name ? `, ${name}` : ""}! 🎉</h2>
                <p>Your account has been created via CoinPay. You can always log in using CoinPay, but if you'd like to set a password for direct login, click below:</p>
                <p style="margin: 25px 0;">
                  <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Set Your Password</a>
                </p>
                <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours. If you don't need a password, you can ignore this — CoinPay login will always work.</p>
              </div>
            `,
            text: `Welcome to ugig.net! Set your password here: ${resetUrl}`,
          });
        } catch (emailErr) {
          console.error("[CoinPay OAuth] Welcome email failed (non-fatal):", emailErr);
        }
      }

      // Link the OAuth identity
      await supabase.from("oauth_identities").insert({
        user_id: userId,
        provider: "coinpay",
        provider_user_id: sub,
        email,
        metadata: identityMetadata,
      });
    }

    // Generate magic link to establish session
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkErr || !linkData) {
      console.error("[CoinPay OAuth] Magic link generation failed:", linkErr);
      return NextResponse.redirect(`${loginUrl}?error=coinpay_session_failed`);
    }

    // The hashed_token from generateLink can be used to construct the confirm URL
    // Supabase will set the session cookie when the user hits /auth/confirm
    const confirmUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=/dashboard`;

    // Clear the state cookie
    return redirectWithClearedState(confirmUrl);
  } catch (err) {
    console.error("[CoinPay OAuth] Unexpected error:", err);
    return NextResponse.redirect(`${loginUrl}?error=coinpay_error`);
  }
}

function generateUsername(email: string, name?: string): string {
  const base = name
    ? name.toLowerCase().replace(/[^a-z0-9]/g, "")
    : email.split("@")[0].replace(/[^a-z0-9]/g, "");
  const suffix = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0");
  return `${base}${suffix}`;
}
