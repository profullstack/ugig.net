import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCreditDeps, mintCreditCode } from "@/lib/credits";

/** GET /api/admin/credit-codes: every code (never the code itself, only its id and label). */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const codes = await getCreditDeps().credits.list();
  return NextResponse.json({ data: codes });
}

/**
 * POST /api/admin/credit-codes  { days, label?, max_redemptions?, expires_at? (ISO) }
 * Mint a code worth `days` of Pro. The plaintext code is in this response only.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const days = Number(body.days);
  const max = body.max_redemptions === undefined ? 1 : Number(body.max_redemptions);
  const expiresAt =
    typeof body.expires_at === "string" && body.expires_at ? Date.parse(body.expires_at) : null;
  if (!Number.isInteger(days) || days < 1 || days > 3660) {
    return NextResponse.json({ error: "days must be a whole number from 1 to 3660" }, { status: 400 });
  }
  if (!Number.isInteger(max) || max < 1 || max > 10000) {
    return NextResponse.json({ error: "max_redemptions must be 1 to 10000" }, { status: 400 });
  }
  if (expiresAt !== null && !Number.isFinite(expiresAt)) {
    return NextResponse.json({ error: "expires_at must be an ISO date" }, { status: 400 });
  }

  const minted = await mintCreditCode({
    days,
    label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : undefined,
    maxRedemptions: max,
    expiresAt,
    createdBy: gate.auth.user.id,
  });
  return NextResponse.json({ data: minted }, { status: 201 });
}
