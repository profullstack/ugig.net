import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

function parsePaginationParam(
  value: string | null,
  defaultValue: number,
  min: number,
  max: number
) {
  const parsed = Number(value && value.trim() !== "" ? value : defaultValue);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

// GET /api/webhooks/[id]/deliveries - View delivery logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: webhookId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Verify webhook ownership
    const { data: webhook } = await supabase
      .from("webhooks")
      .select("id, user_id")
      .eq("id", webhookId)
      .single();

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    if (webhook.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse pagination
    const { searchParams } = new URL(request.url);
    const limit = parsePaginationParam(searchParams.get("limit"), 50, 1, 100);
    const offset = parsePaginationParam(
      searchParams.get("offset"),
      0,
      0,
      100_000
    );

    const {
      data: deliveries,
      error,
      count,
    } = await supabase
      .from("webhook_deliveries")
      .select("*", { count: "exact" })
      .eq("webhook_id", webhookId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: deliveries,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
