import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/zaps/history?direction=sent|received&limit=50&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const direction = url.searchParams.get("direction") || "received";
    const parsedLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const parsedOffset = parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 50;
    const offset =
      Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    const admin = createServiceClient();
    const userId = auth.user.id;

    const column = direction === "sent" ? "sender_id" : "recipient_id";
    const otherColumn = direction === "sent" ? "recipient_id" : "sender_id";

    const { data: zaps, count } = await admin
      .from("zaps" as any)
      .select("id, sender_id, recipient_id, amount_sats, fee_sats, target_type, target_id, note, created_at", { count: "exact" })
      .eq(column, userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1) as any;

    if (!zaps || zaps.length === 0) {
      return NextResponse.json({ zaps: [], total: count || 0 });
    }

    // Fetch profiles for the other party
    const otherIds = [...new Set(zaps.map((z: any) => z[otherColumn]))] as string[];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", otherIds) as any;

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p])) as Map<string, any>;

    // Enrich zaps with profile info and target context
    const enriched = zaps.map((z: any) => {
      const otherId = z[otherColumn];
      const profile = profileMap.get(otherId) as any;
      return {
        id: z.id,
        amount_sats: z.amount_sats,
        fee_sats: z.fee_sats,
        target_type: z.target_type,
        target_id: z.target_id,
        note: z.note,
        created_at: z.created_at,
        user: profile ? {
          id: profile.id,
          username: profile.username,
          name: profile.full_name,
          avatar_url: profile.avatar_url,
        } : { id: otherId, username: null, name: "Unknown", avatar_url: null },
      };
    });

    return NextResponse.json({ zaps: enriched, total: count || 0 });
  } catch (err) {
    console.error("Zap history error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
