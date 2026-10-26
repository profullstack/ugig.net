import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { getAppUrl } from "@/lib/app-url";
import { checkRateLimit, rateLimitExceeded } from "@/lib/rate-limit";
import {
  InviteError,
  createInvite,
  inviteOverview,
  inviteUrl,
  settleInviteBonus,
  settleInvitesSentBy,
} from "@/lib/credits";

/**
 * GET /api/invites: my invite quota, the invites I sent (codes are shown only
 * once, at creation), and my open referral link (the existing ?ref= link).
 * Also settles any invite bonus that has become due, for me as invitee and for
 * the people I invited.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = auth.user.id;

  try {
    await Promise.all([settleInviteBonus(userId), settleInvitesSentBy(userId)]).catch((err) =>
      console.error("[invites] settle on view failed:", err)
    );
    const overview = await inviteOverview(userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (auth.supabase as any)
      .from("profiles")
      .select("referral_code, username")
      .eq("id", userId)
      .maybeSingle();
    const refCode = profile?.referral_code || profile?.username || null;

    return NextResponse.json({
      ...overview,
      referral: refCode ? { code: refCode, link: `${getAppUrl(request)}/?ref=${refCode}` } : null,
    });
  } catch (err) {
    console.error("[invites] GET failed:", err);
    return NextResponse.json({ error: "Could not load invites" }, { status: 500 });
  }
}

/**
 * POST /api/invites  { note?: string }: create one invite. The code is in
 * this response only (it is stored as a hash). 409 when the quota is spent,
 * 403 when the account is too new to invite.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`invite:${auth.user.id}`, "auth");
  if (!rl.allowed) return rateLimitExceeded(rl);

  let note = "";
  try {
    const body = await request.json();
    if (body && typeof body.note === "string") note = body.note;
  } catch {
    // No body: no note.
  }

  try {
    const invite = await createInvite(auth.user.id, note);
    return NextResponse.json(
      { invite: { ...invite, url: inviteUrl(getAppUrl(request), invite.code) } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status });
    }
    console.error("[invites] create failed:", err);
    return NextResponse.json({ error: "Could not create an invite" }, { status: 500 });
  }
}
