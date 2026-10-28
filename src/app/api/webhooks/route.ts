import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { z } from "zod";
import { getHooks, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/hub";
import { legacyError, toLegacyWebhook } from "@/lib/webhooks/legacy-api";

/**
 * The original webhooks API, now backed by @profullstack/webhooks.
 * Same request and response shapes as before; /api/v1/webhooks is the full API
 * (test, rotate, secret, delivery retry).
 */

const createWebhookSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, "Must subscribe to at least one event"),
  active: z.boolean().optional().default(true),
});

// GET /api/webhooks - List user's webhooks
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const endpoints = await getHooks().listEndpoints(auth.user.id);
    const data = endpoints
      .map((e) => toLegacyWebhook(e))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({ data });
  } catch (err) {
    return legacyError(err);
  }
}

// POST /api/webhooks - Register a new webhook
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const parsed = createWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { url, events, active } = parsed.data;
    const hooks = getHooks();
    const { endpoint, secret } = await hooks.createEndpoint(auth.user.id, { url, events });
    const saved = active ? endpoint : await hooks.updateEndpoint(auth.user.id, endpoint.id, { enabled: false });
    return NextResponse.json({ data: toLegacyWebhook(saved, secret) }, { status: 201 });
  } catch (err) {
    return legacyError(err);
  }
}
