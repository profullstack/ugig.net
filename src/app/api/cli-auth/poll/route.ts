import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";

// Headless CLI login — step 3. The CLI polls here with its device_code. While the
// request is pending it gets 202 authorization_pending. Once the user has approved
// it in the browser, the first successful poll mints an API key for that user and
// returns it exactly once. See /api/cli-auth/start and /api/cli-auth/approve.

export async function POST(request: NextRequest) {
  try {
    let body: { device_code?: string } = {};
    try { body = await request.json(); } catch { /* handled below */ }
    const deviceCode = body?.device_code;
    if (!deviceCode || typeof deviceCode !== "string") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceClient() as any;

    const { data: row } = await db
      .from("device_codes")
      .select("id, status, user_id, scope, expires_at, client_name")
      .eq("device_code", deviceCode)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ status: "expired", error: "expired_token" }, { status: 400 });
    }
    if (row.status === "denied") {
      return NextResponse.json({ status: "denied", error: "access_denied" }, { status: 400 });
    }
    if (row.status === "completed") {
      // Already consumed — don't mint a second key.
      return NextResponse.json({ status: "expired", error: "expired_token" }, { status: 400 });
    }
    if (row.status !== "approved" || !row.user_id) {
      return NextResponse.json({ status: "pending", error: "authorization_pending" }, { status: 202 });
    }

    // Approved. Atomically claim the row so concurrent polls can't double-mint.
    const { data: claimed } = await db
      .from("device_codes")
      .update({ status: "completed" })
      .eq("id", row.id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      // Another poll won the claim; treat this one as already consumed.
      return NextResponse.json({ status: "expired", error: "expired_token" }, { status: 400 });
    }

    const scope: "full" | "public" = row.scope === "public" ? "public" : "full";
    const rawKey = generateApiKey(scope);
    const keyHash = await hashApiKey(rawKey);
    const keyPrefix = getKeyPrefix(rawKey);
    const base = `CLI login${row.client_name ? ` (${row.client_name})` : ""}`;

    // api_keys is unique per (user_id, name); disambiguate on collision.
    let insErr = (await db.from("api_keys").insert({
      user_id: row.user_id, name: base, key_hash: keyHash, key_prefix: keyPrefix, scope,
    })).error;
    if (insErr) {
      insErr = (await db.from("api_keys").insert({
        user_id: row.user_id, name: `${base} ${Date.now()}`, key_hash: keyHash, key_prefix: keyPrefix, scope,
      })).error;
    }
    if (insErr) {
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    return NextResponse.json({ status: "complete", api_key: rawKey, scope });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
