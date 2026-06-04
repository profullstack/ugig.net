import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

const MAX_NOTIFICATION_OFFSET = 100_000;
const MAX_NOTIFICATION_LIMIT = 100;

// GET /api/notifications - List user's notifications
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Update last_active_at (fire and forget, piggybacks on 30s notification poll)
    void supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", user.id)
      .then(() => {}, () => {});

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get("unread") === "true";

    // Validate limit: must be positive integer if provided
    const limitRaw = searchParams.get("limit");
    let limit = 50; // default
    if (limitRaw !== null) {
      const v = Number(limitRaw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1) {
        return NextResponse.json(
          { error: "Invalid limit. Must be a positive integer (>= 1)." },
          { status: 400 }
        );
      }
      limit = Math.min(v, MAX_NOTIFICATION_LIMIT);
    }

    // Validate offset: must be non-negative integer if provided
    const offsetRaw = searchParams.get("offset");
    let offset = 0; // default
    if (offsetRaw !== null) {
      const v = Number(offsetRaw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
        return NextResponse.json(
          { error: "Invalid offset. Must be a non-negative integer (>= 0)." },
          { status: 400 }
        );
      }
      offset = Math.min(v, MAX_NOTIFICATION_OFFSET);
    }

    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.is("read_at", null);
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      console.error("[GET /api/notifications] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Get unread count separately
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    return NextResponse.json({
      notifications,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
      unread_count: unreadCount || 0,
    });
  } catch (err) {
    console.error("[GET /api/notifications] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
