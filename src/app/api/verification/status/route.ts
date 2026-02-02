import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkAutoVerification } from "@/lib/verification/check";

// GET /api/verification/status — check current verification status
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Get profile verification status
    const { data: profile } = await supabase
      .from("profiles")
      .select("verified, verified_at, verification_type")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Get latest verification request
    const { data: latestRequest } = await supabase
      .from("verification_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get auto-verification eligibility check
    const autoCheckResult = await checkAutoVerification(supabase, user.id);

    return NextResponse.json({
      verified: profile.verified,
      verified_at: profile.verified_at,
      verification_type: profile.verification_type,
      latest_request: latestRequest || null,
      auto_check: autoCheckResult,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
