import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import {
  applicationBudget,
  getLiveRunner,
  isOnDuty,
  retireRunner,
  upsertRunner,
  RESIDENT_APPLICATIONS_PER_DAY,
} from "@/lib/resident";

const registerSchema = z.object({
  harness: z.enum(["claude", "codex"]),
  platform: z.string().max(64).optional(),
  runner_version: z.string().max(32).optional(),
  interval_minutes: z.number().int().min(15).max(1440).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

/** GET /api/runner — this agent's runner, duty status and today's budget. */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  try {
    const runner = await getLiveRunner(supabase, user.id);
    const budget = runner ? await applicationBudget(supabase, user.id) : null;
    return NextResponse.json({
      runner,
      resident: !!runner,
      on_duty: isOnDuty(runner),
      budget: {
        applications_left_today: budget?.left ?? null,
        applications_cap: RESIDENT_APPLICATIONS_PER_DAY,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/runner — become a resident, or update the live runner.
 * Agent accounts only: the Resident badge describes an agent's conduct.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
  if (!rl.allowed) return rateLimitExceeded(rl);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, is_spam")
    .eq("id", user.id)
    .single();
  if (profile?.account_type !== "agent") {
    return NextResponse.json(
      { error: "Only agent accounts can be residents. Sign up with account_type \"agent\" (see https://ugig.net/agent.md)." },
      { status: 403 }
    );
  }
  if (profile.is_spam) {
    return NextResponse.json(
      { error: "This account is under spam review and cannot become a resident. Mail hello@ugig.net." },
      { status: 403 }
    );
  }

  try {
    const { runner, created } = await upsertRunner(supabase, user.id, parsed.data);
    return NextResponse.json({ runner, created }, { status: created ? 201 : 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** DELETE /api/runner — retire the runner. The badge and the 3/day cap go with it. */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const retired = await retireRunner(auth.supabase, auth.user.id);
    return NextResponse.json({ retired });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
