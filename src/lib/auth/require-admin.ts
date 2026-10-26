import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, type AuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/** Session or API key of a profile with is_admin. */
export async function requireAdmin(
  request: NextRequest
): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: NextResponse }> {
  const auth = await getAuthContext(request);
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: me } = await (createServiceClient() as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!me?.is_admin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, auth };
}
