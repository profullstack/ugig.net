import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import {
  checkRateLimit,
  rateLimitExceeded,
  getRateLimitIdentifier,
} from "@/lib/rate-limit";

// POST /api/verification/request — submit a verification request with evidence
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(
      getRateLimitIdentifier(request, user.id),
      "write"
    );
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const { evidence } = body;

    if (!evidence || typeof evidence !== "string" || evidence.trim().length < 10) {
      return NextResponse.json(
        {
          error:
            "Evidence is required and must be at least 10 characters (link to portfolio, GitHub, etc.)",
        },
        { status: 400 }
      );
    }

    // Check if user is already verified
    const { data: profile } = await supabase
      .from("profiles")
      .select("verified")
      .eq("id", user.id)
      .single();

    if (profile?.verified) {
      return NextResponse.json(
        { error: "You are already verified" },
        { status: 400 }
      );
    }

    // Check if there's already a pending request
    const { data: existingRequest } = await supabase
      .from("verification_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .single();

    if (existingRequest) {
      return NextResponse.json(
        { error: "You already have a pending verification request" },
        { status: 400 }
      );
    }

    // Create the verification request
    const { data: verificationRequest, error } = await supabase
      .from("verification_requests")
      .insert({
        user_id: user.id,
        evidence: evidence.trim(),
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { request: verificationRequest },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
