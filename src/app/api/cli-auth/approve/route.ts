import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Headless CLI login — step 2 (the browser side). GET returns the pending
// request's details for display; POST approves or denies it. Both require a
// signed-in web session — that session's user is who the CLI is authorized as.

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = normalizeCode(request.nextUrl.searchParams.get("code") || "");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data: row } = await db
    .from("device_codes")
    .select("status, scope, client_name, expires_at")
    .eq("user_code", code)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const expired = new Date(row.expires_at).getTime() < Date.now();
  return NextResponse.json({
    status: expired ? "expired" : row.status,
    scope: row.scope,
    client_name: row.client_name,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { user_code?: string; action?: string } = {};
  try { body = await request.json(); } catch { /* handled below */ }
  const code = normalizeCode(body?.user_code || "");
  const action = body?.action === "deny" ? "deny" : "approve";
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const { data: row } = await db
    .from("device_codes")
    .select("id, status, expires_at")
    .eq("user_code", code)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Unknown code" }, { status: 404 });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This request has expired." }, { status: 400 });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: "This request has already been handled." }, { status: 409 });
  }

  const { data: updated } = await db
    .from("device_codes")
    .update({
      status: action === "deny" ? "denied" : "approved",
      user_id: action === "deny" ? null : user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!updated) return NextResponse.json({ error: "This request has already been handled." }, { status: 409 });
  return NextResponse.json({ ok: true, action });
}
