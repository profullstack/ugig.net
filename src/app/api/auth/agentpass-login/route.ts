/**
 * AgentPass Browser Login
 * POST /api/auth/agentpass-login
 *
 * Accepts passport ID + private key from the browser form,
 * generates HMAC signature server-side, verifies via AgentPass API,
 * finds/creates user, and establishes session via Supabase magic link.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes } from "crypto";
import { fetchPassport, verifySignature } from "@/lib/auth/agentpass";
import { sendEmail } from "@/lib/email";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { passportId, privateKey } = await request.json();

    if (!passportId || !privateKey) {
      return NextResponse.json(
        { error: "Passport ID and private key are required" },
        { status: 400 }
      );
    }

    // Fetch passport from AgentPass API
    const passport = await fetchPassport(passportId);
    if (!passport || !passport.public_key) {
      return NextResponse.json(
        { error: "Passport not found or missing public key" },
        { status: 401 }
      );
    }

    if (passport.status && passport.status !== "active") {
      return NextResponse.json(
        { error: "Passport is not active" },
        { status: 401 }
      );
    }

    // Generate signature using the provided private key and verify it
    const timestamp = Date.now().toString();
    const payload = `${passportId}:${timestamp}`;
    const signature = createHmac("sha256", privateKey).update(payload).digest("hex");

    if (!verifySignature(passportId, timestamp, signature, passport.public_key)) {
      return NextResponse.json(
        { error: "Invalid private key — signature verification failed" },
        { status: 401 }
      );
    }

    // Auth verified — find or create user
    const supabase = getAdminSupabase();
    const email = passport.email;

    if (!email) {
      return NextResponse.json(
        { error: "Passport has no email — cannot create account" },
        { status: 400 }
      );
    }

    // Check for existing user by agentpass_id or email
    let userId: string | null = null;

    const { data: byPassport } = await supabase
      .from("profiles")
      .select("id")
      .eq("agentpass_id" as any, passportId)
      .maybeSingle();

    if (byPassport) {
      userId = byPassport.id;
    } else {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (byEmail) {
        userId = byEmail.id;
        // Link passport ID
        await supabase
          .from("profiles")
          .update({ agentpass_id: passportId } as any)
          .eq("id", byEmail.id);
      }
    }

    // Create new user if not found
    if (!userId) {
      const username = `ap_${passportId.replace(/^ap_/, "").slice(0, 12)}`;
      const displayName = passport.name || `Agent ${passportId.slice(-6)}`;
      const randomPassword = randomBytes(32).toString("hex");

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          username,
          account_type: "agent",
          agent_name: displayName,
          agentpass_id: passportId,
          oauth_provider: "agentpass",
        },
      });

      if (authError && !authError.message?.includes("already been registered")) {
        console.error("[AgentPass Login] Failed to create user:", authError.message);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      if (authData?.user) {
        userId = authData.user.id;

        await supabase.from("profiles").upsert(
          {
            id: userId,
            email,
            username,
            full_name: displayName,
            display_name: displayName,
            account_type: "agent",
            agent_name: displayName,
            agentpass_id: passportId,
            profile_completed: false,
          } as any,
          { onConflict: "id" }
        );

        await (supabase as any).from("oauth_identities").insert({
          user_id: userId,
          provider: "agentpass",
          provider_user_id: passportId,
          email,
          metadata: { name: displayName, agentpass_id: passportId },
        });

        // Generate API key
        const rawKey = generateApiKey();
        const keyHash = await hashApiKey(rawKey);
        const keyPrefix = getKeyPrefix(rawKey);
        await supabase.from("api_keys").insert({
          user_id: userId,
          name: "AgentPass Auto Key",
          key_hash: keyHash,
          key_prefix: keyPrefix,
        });
      } else {
        // User exists via email — find them
        let page = 1;
        while (!userId) {
          const { data: { users } } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
          if (!users || users.length === 0) break;
          const found = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          if (found) {
            userId = found.id;
            await supabase
              .from("profiles")
              .update({ agentpass_id: passportId } as any)
              .eq("id", found.id);
          }
          page++;
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Failed to find or create account" },
        { status: 500 }
      );
    }

    // Generate magic link to establish browser session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[AgentPass Login] Magic link generation failed:", linkError?.message);
      return NextResponse.json(
        { error: "Session creation failed" },
        { status: 500 }
      );
    }

    const confirmUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=/dashboard`;

    return NextResponse.json({ redirectUrl: confirmUrl });
  } catch (err) {
    console.error("[AgentPass Login] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
