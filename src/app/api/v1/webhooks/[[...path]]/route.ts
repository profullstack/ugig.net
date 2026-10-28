import { NextRequest, NextResponse } from "next/server";
import { webhooksApi } from "@profullstack/webhooks";
import { getAuthContext, requireFullAccess } from "@/lib/auth/get-user";
import { getHooks } from "@/lib/webhooks/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/v1/webhooks: the @profullstack/webhooks API, scoped to the caller.
 * Session cookie, Supabase bearer token or a full-access ugig API key.
 *
 *   GET    /                      endpoints + event_types
 *   POST   /                      { url, events?, description? } -> { endpoint, secret }
 *   GET|PATCH|DELETE /:id
 *   GET    /:id/secret            POST /:id/rotate      POST /:id/test
 *   GET    /:id/deliveries        GET /deliveries       POST /deliveries/:id/retry
 */
async function handle(request: NextRequest): Promise<Response> {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireFullAccess(auth);
  if (denied) return denied;

  const api = webhooksApi(getHooks(), {
    basePath: "/api/v1/webhooks",
    owner: () => auth.user.id,
  });
  try {
    return (await api(request)) ?? NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error("[webhooks api]", err);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
