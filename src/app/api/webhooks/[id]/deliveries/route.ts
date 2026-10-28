import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { getHooks } from "@/lib/webhooks/hub";
import { legacyError, toLegacyDelivery } from "@/lib/webhooks/legacy-api";

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

// GET /api/webhooks/[id]/deliveries - View delivery logs (the hub keeps the last 200)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: webhookId } = await params;
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = parsePaginationParam(searchParams.get("limit"), 50, 1, 100);
    const offset = parsePaginationParam(searchParams.get("offset"), 0, 0, 199);
    const all = await getHooks().deliveries(auth.user.id, {
      endpointId: webhookId,
      limit: Math.min(200, offset + limit),
    });
    return NextResponse.json({
      data: all.slice(offset, offset + limit).map(toLegacyDelivery),
      pagination: { total: all.length, limit, offset },
    });
  } catch (err) {
    return legacyError(err);
  }
}
