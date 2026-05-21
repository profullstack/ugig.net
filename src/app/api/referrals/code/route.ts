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

    const { data: profile, error } = await (supabase as any)
      .from("profiles")
      .select("referral_code, username")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const code = profile.referral_code || profile.username;
    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || "https://ugig.net"
    ).replace(/\/$/, "");

    return NextResponse.json({
      code,
      link: `${baseUrl}/?ref=${encodeURIComponent(code)}`,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
