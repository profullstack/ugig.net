import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded } from "@/lib/rate-limit";
import { INVITE_BONUS_PRO_DAYS, acceptInvite } from "@/lib/credits";

/**
 * POST /api/invites/accept  { code: "INV-XXXX-XXXX-XXXX" }
 *
 * Join on an invite (accounts up to a week old, once). Both people get
 * INVITE_BONUS_PRO_DAYS of Pro as soon as the new account has confirmed its
 * email and passes the spam checks: `bonus` is "granted" or "pending".
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`invite-accept:${auth.user.id}`, "auth");
  if (!rl.allowed) return rateLimitExceeded(rl);

  let code: unknown;
  try {
    code = (await request.json())?.code;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim() || code.length > 64) {
    return NextResponse.json({ error: "Enter an invite code.", reason: "invalid" }, { status: 400 });
  }

  try {
    const r = await acceptInvite(auth.user.id, code);
    if (!r.ok) return NextResponse.json({ error: r.message, reason: r.reason }, { status: 400 });
    return NextResponse.json({
      ok: true,
      bonus: r.bonus,
      bonus_days: INVITE_BONUS_PRO_DAYS,
      ...(r.bonus === "pending"
        ? { message: "Invite accepted. Your Pro days arrive once your account is confirmed." }
        : { message: `Invite accepted. You both got ${INVITE_BONUS_PRO_DAYS} days of Pro.` }),
    });
  } catch (err) {
    console.error("[invites/accept] failed:", err);
    return NextResponse.json({ error: "Could not accept the invite. Try again." }, { status: 500 });
  }
}
