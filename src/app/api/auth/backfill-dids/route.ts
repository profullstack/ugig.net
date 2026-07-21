/**
 * POST /api/auth/backfill-dids
 *
 * Backfill DIDs for users who don't have one yet.
 * Protected by AUTH_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateAndStoreDid } from "@/lib/auth/did";
import { timingSafeStringEqual } from "@/lib/security/constant-time";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const secret = process.env.AUTH_WEBHOOK_SECRET;

  if (!secret) {
    console.error("AUTH_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (
    !timingSafeStringEqual(authHeader, `Bearer ${secret}`) &&
    !timingSafeStringEqual(authHeader, secret)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find users with confirmed email but no DID
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, username")
    .not("email_confirmed_at", "is", null)
    .is("did", null)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, backfilled: 0 });
  }

  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      // We don't have email in profiles, use username as fallback
      const did = await generateAndStoreDid(supabase, user.id, `${user.username}@ugig.net`);
      if (did) success++;
      else failed++;
    } catch {
      failed++;
    }
  }

  console.log(`[Backfill DIDs] ${success} success, ${failed} failed, ${users.length} total`);

  return NextResponse.json({ ok: true, backfilled: success, failed, total: users.length });
}
