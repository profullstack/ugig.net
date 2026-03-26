import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/profile/wallet-addresses
 * Returns wallet addresses for the current user and optionally for a worker
 * Query params:
 * - worker_id=uuid (optional)
 * - gig_id=uuid (required when worker_id is provided)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user, supabase } = auth;
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");
    const gigId = searchParams.get("gig_id");

    // Get poster (current user) addresses
    const { data: posterProfile } = await supabase
      .from("profiles")
      .select("wallet_addresses")
      .eq("id", user.id)
      .single();

    const posterAddresses = Array.isArray(posterProfile?.wallet_addresses)
      ? posterProfile.wallet_addresses
      : [];

    let workerAddresses: any[] = [];

    if (workerId) {
      if (!gigId) {
        return NextResponse.json(
          { error: "gig_id is required with worker_id" },
          { status: 400 }
        );
      }

      const service = createServiceClient();

      // Security: caller must own the gig
      const { data: gig } = await service
        .from("gigs")
        .select("id, poster_id")
        .eq("id", gigId)
        .single();

      if (!gig || gig.poster_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Security: worker must be an applicant on this gig
      const { data: app } = await service
        .from("applications")
        .select("id")
        .eq("gig_id", gigId)
        .eq("applicant_id", workerId)
        .maybeSingle();

      if (!app) {
        return NextResponse.json(
          { error: "Worker is not an applicant for this gig" },
          { status: 404 }
        );
      }

      const { data: workerProfile } = await service
        .from("profiles")
        .select("wallet_addresses")
        .eq("id", workerId)
        .single();

      workerAddresses = Array.isArray(workerProfile?.wallet_addresses)
        ? workerProfile.wallet_addresses
        : [];
    }

    return NextResponse.json({
      poster_addresses: posterAddresses,
      worker_addresses: workerAddresses,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch wallet addresses" },
      { status: 500 }
    );
  }
}
