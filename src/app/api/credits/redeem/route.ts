import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded } from "@/lib/rate-limit";
import { redeemCreditCode } from "@/lib/credits";

/**
 * POST /api/credits/redeem  { code: "CR-XXXX-XXXX-XXXX-XXXX" }
 *
 * Redeem a credit code for days of Pro. Days extend the same subscriptions
 * row a CoinPay payment does. Errors: 400 { error, reason } where reason is
 * invalid | expired | used_up | already_redeemed | revoked.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`redeem:${auth.user.id}`, "auth");
  if (!rl.allowed) return rateLimitExceeded(rl);

  let code: unknown;
  try {
    code = (await request.json())?.code;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim() || code.length > 64) {
    return NextResponse.json({ error: "Enter a code.", reason: "invalid" }, { status: 400 });
  }

  try {
    const r = await redeemCreditCode(auth.user.id, code);
    if (!r.ok) return NextResponse.json({ error: r.message, reason: r.reason }, { status: 400 });
    return NextResponse.json({
      ok: true,
      granted: { unit: "pro_days", amount: r.days },
      plan: "pro",
      current_period_end: r.currentPeriodEnd,
    });
  } catch (err) {
    console.error("[credits/redeem] failed:", err);
    return NextResponse.json({ error: "Could not redeem the code. Try again." }, { status: 500 });
  }
}
