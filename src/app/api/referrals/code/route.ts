import { getAppUrl } from "@/lib/app-url";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/referrals/code - Get my referral link/code
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error } = await (supabase as any)
      .from("profiles")
      .select("referral_code, username")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const code = profile.referral_code || profile.username;

    return NextResponse.json({
      code,
      link: `${getAppUrl(request)}/?ref=${code}`,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
