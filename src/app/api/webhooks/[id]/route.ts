import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { z } from "zod";
import { getHooks, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/hub";
import { legacyError, toLegacyWebhook } from "@/lib/webhooks/legacy-api";

const updateWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048).optional(),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, "Must subscribe to at least one event")
    .optional(),
  active: z.boolean().optional(),
});

// PUT /api/webhooks/[id] - Update a webhook
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const parsed = updateWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { url, events, active } = parsed.data;
    const endpoint = await getHooks().updateEndpoint(auth.user.id, id, {
      ...(url !== undefined ? { url } : {}),
      ...(events !== undefined ? { events } : {}),
      ...(active !== undefined ? { enabled: active } : {}),
    });
    return NextResponse.json({ data: toLegacyWebhook(endpoint) });
  } catch (err) {
    return legacyError(err);
  }
}

// DELETE /api/webhooks/[id] - Remove a webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await getHooks().deleteEndpoint(auth.user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return legacyError(err);
  }
}
