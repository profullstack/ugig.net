/**
 * AgentPass authentication module.
 *
 * Allows AI agents to authenticate using their AgentPass passport.
 * This is an OPTIONAL auth method — existing API key and session auth
 * continue to work unchanged.
 *
 * Flow:
 *   1. Agent sends: Authorization: AgentPass <passport_id>:<signature>:<timestamp>
 *   2. Server fetches passport from AgentPass API
 *   3. Server verifies HMAC signature using passport's public key
 *   4. If valid, maps to existing user (by email) or creates a new agent account
 */

import { createHmac, randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const AGENTPASS_API = process.env.AGENTPASS_API_URL || "https://api.agentpass.space";
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

export type AgentPassAuthResult = {
  userId: string;
  passportId: string;
  email?: string;
};

type PassportData = {
  id: string;
  name?: string;
  email?: string;
  public_key?: string;
  status?: string;
};

/**
 * Parse the AgentPass Authorization header.
 * Expected format: "AgentPass <passport_id>:<signature>:<timestamp>"
 */
export function parseAgentPassHeader(
  authHeader: string | null
): { passportId: string; signature: string; timestamp: string } | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^AgentPass\s+(\S+)$/i);
  if (!match) return null;

  const parts = match[1].split(":");
  if (parts.length !== 3) return null;

  const [passportId, signature, timestamp] = parts;
  if (!passportId || !signature || !timestamp) return null;

  return { passportId, signature, timestamp };
}

/**
 * Fetch passport data from the AgentPass API.
 */
export async function fetchPassport(passportId: string): Promise<PassportData | null> {
  try {
    const res = await fetch(`${AGENTPASS_API}/v1/passports/${passportId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.passport ?? data ?? null;
  } catch {
    return null;
  }
}

/**
 * Verify the HMAC-SHA256 signature.
 * The signing payload is: `${passportId}:${timestamp}`
 */
export function verifySignature(
  passportId: string,
  timestamp: string,
  signature: string,
  publicKey: string
): boolean {
  const payload = `${passportId}:${timestamp}`;
  const expected = createHmac("sha256", publicKey).update(payload).digest("hex");
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Find or create a ugig user for the given AgentPass passport.
 */
async function findOrCreateUser(
  supabase: SupabaseClient<Database>,
  passport: PassportData
): Promise<string | null> {
  const email = passport.email;

  // Try to find existing user by email
  if (email) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // Link passport ID to profile for future lookups
      await supabase
        .from("profiles")
        .update({ agentpass_id: passport.id } as any)
        .eq("id", existing.id);
      return existing.id;
    }
  }

  // Try by agentpass_id directly
  const { data: byPassport } = await supabase
    .from("profiles")
    .select("id")
    .eq("agentpass_id" as any, passport.id)
    .maybeSingle();

  if (byPassport) return byPassport.id;

  // No existing user — create one (agent account)
  if (!email) return null; // Can't create without email

  const username = `ap_${passport.id.replace(/^ap_/, "").slice(0, 12)}`;
  const displayName = passport.name || `Agent ${passport.id.slice(-6)}`;
  const randomPassword = randomBytes(32).toString("hex");

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: randomPassword,
    email_confirm: true,
    user_metadata: {
      username,
      account_type: "agent",
      agent_name: displayName,
      agentpass_id: passport.id,
      oauth_provider: "agentpass",
    },
  });

  if (authError || !authData.user) {
    // If email already exists, find the existing user
    if (
      (authError as any)?.code === "email_exists" ||
      authError?.message?.includes("already been registered")
    ) {
      let existingUser: any = null;
      let page = 1;
      while (!existingUser) {
        const {
          data: { users },
        } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
        if (!users || users.length === 0) break;
        existingUser = users.find(
          (u: any) => u.email?.toLowerCase() === email!.toLowerCase()
        );
        page++;
      }
      if (!existingUser) {
        console.error("[AgentPass] User exists but couldn't find by email:", email);
        return null;
      }
      // Link passport ID to existing profile
      await supabase
        .from("profiles")
        .update({ agentpass_id: passport.id } as any)
        .eq("id", existingUser.id);
      return existingUser.id;
    }
    console.error("[AgentPass] Failed to create user:", authError?.message);
    return null;
  }

  const userId = authData.user.id;

  // Create profile (consistent with CoinPay OAuth flow)
  await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      username,
      full_name: displayName,
      display_name: displayName,
      account_type: "agent",
      agent_name: displayName,
      agentpass_id: passport.id,
      profile_completed: false,
    } as any,
    { onConflict: "id" }
  );

  // Link OAuth identity (consistent with CoinPay flow)
  await (supabase as any).from("oauth_identities").insert({
    user_id: userId,
    provider: "agentpass",
    provider_user_id: passport.id,
    email,
    metadata: { name: displayName, agentpass_id: passport.id },
  });

  // Generate API key so the agent can also use standard auth
  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);
  await supabase.from("api_keys").insert({
    user_id: userId,
    name: "AgentPass Auto Key",
    key_hash: keyHash,
    key_prefix: keyPrefix,
  });

  // Send welcome email with password reset link (consistent with CoinPay flow)
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
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
          <h2 style="color: #667eea;">Welcome to ugig.net${displayName ? `, ${displayName}` : ""}! 🎉</h2>
          <p>Your account has been created via AgentPass. You can always log in using AgentPass, but if you'd like to set a password for direct login, click below:</p>
          <p style="margin: 25px 0;">
            <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Set Your Password</a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 24 hours. If you don't need a password, you can ignore this — AgentPass login will always work.</p>
        </div>
      `,
      text: `Welcome to ugig.net! Set your password here: ${resetUrl}`,
    });
  } catch (emailErr) {
    console.error("[AgentPass] Welcome email failed (non-fatal):", emailErr);
  }

  console.log(`[AgentPass] Created agent account ${username} for passport ${passport.id}`);
  return userId;
}

/**
 * Authenticate a request using AgentPass.
 * Returns the user ID and passport ID if valid, null otherwise.
 */
export async function authenticateAgentPass(
  authHeader: string | null
): Promise<AgentPassAuthResult | null> {
  const parsed = parseAgentPassHeader(authHeader);
  if (!parsed) return null;

  const { passportId, signature, timestamp } = parsed;

  // Check timestamp freshness
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > MAX_TIMESTAMP_DRIFT_MS) {
    console.warn("[AgentPass] Timestamp too old or invalid:", timestamp);
    return null;
  }

  // Fetch passport from AgentPass API
  const passport = await fetchPassport(passportId);
  if (!passport || !passport.public_key) {
    console.warn("[AgentPass] Passport not found or missing public key:", passportId);
    return null;
  }

  if (passport.status && passport.status !== "active") {
    console.warn("[AgentPass] Passport not active:", passportId, passport.status);
    return null;
  }

  // Verify signature
  if (!verifySignature(passportId, timestamp, signature, passport.public_key)) {
    console.warn("[AgentPass] Invalid signature for passport:", passportId);
    return null;
  }

  // Find or create user
  const supabase = createServiceClient();
  const userId = await findOrCreateUser(supabase, passport);
  if (!userId) return null;

  return {
    userId,
    passportId: passport.id,
    email: passport.email,
  };
}
