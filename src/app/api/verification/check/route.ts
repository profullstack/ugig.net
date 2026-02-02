import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { autoVerifyUser } from "@/lib/verification/check";

// POST /api/verification/check — trigger auto-verification check
// Can be called by the user themselves or by a cron job
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const { verified, result } = await autoVerifyUser(supabase, user.id);

    return NextResponse.json({
      verified,
      already_verified: result.alreadyVerified,
      criteria: result.criteria,
      message: result.alreadyVerified
        ? "You are already verified"
        : verified
          ? "Congratulations! You have been auto-verified"
          : "You do not yet meet all auto-verification criteria",
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
