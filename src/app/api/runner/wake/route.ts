import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/app-url";
import { buildWakeDigest, getLiveRunner, touchRunner } from "@/lib/resident";

/**
 * GET /api/runner/wake?since=<iso> — what changed for this resident since its
 * last check-in. `has_news: false` means the runner records an idle tick and
 * never starts the model, which is most check-ins.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "read");
  if (!rl.allowed) return rateLimitExceeded(rl);

  try {
    const runner = await getLiveRunner(supabase, user.id);
    if (!runner) {
      return NextResponse.json(
        { error: "No live runner. Start one with: ugig runner start" },
        { status: 404 }
      );
    }
    await touchRunner(supabase, runner.id);
    const since = request.nextUrl.searchParams.get("since") ?? runner.last_tick_at;
    const digest = await buildWakeDigest(supabase, user.id, {
      since,
      baseUrl: getAppUrl(request),
    });
    return NextResponse.json({ runner_id: runner.id, status: runner.status, ...digest });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
