import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

const SETTING_KEYS = [
  "email_new_message",
  "email_new_comment",
  "email_new_follower",
  "email_new_application",
  "email_application_status",
  "email_review_received",
  "email_endorsement_received",
  "email_gig_updates",
  "email_mention",
  "email_upvote_milestone",
] as const;

async function readJsonObject(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/notification-settings
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { data, error } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      // No settings yet — return defaults (all true)
      const defaults: Record<string, boolean> = {};
      for (const key of SETTING_KEYS) {
        defaults[key] = true;
      }
      return NextResponse.json({ data: { user_id: user.id, ...defaults } });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT /api/notification-settings
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Only allow known boolean keys
    const updateData: Record<string, boolean> = {};
    for (const key of SETTING_KEYS) {
      if (typeof body[key] === "boolean") {
        updateData[key] = body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    // Upsert
    const { data, error } = await supabase
      .from("notification_settings")
      .upsert(
        { user_id: user.id, ...updateData, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
