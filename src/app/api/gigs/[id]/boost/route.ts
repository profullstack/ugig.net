import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";
import { getBoostEligibility, BOOST_COOLDOWN_DAYS } from "@/lib/boost";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";

// POST /api/gigs/[id]/boost - Bump an active gig back to the top of the listing.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id, status, created_at, boosted_at")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only active gigs appear in the public listing, so only they can be boosted.
    if (existingGig.status !== "active") {
      return NextResponse.json(
        { error: "Only active gigs can be boosted." },
        { status: 400 }
      );
    }

    const eligibility = getBoostEligibility(existingGig);
    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error: `Gigs can be boosted once every ${BOOST_COOLDOWN_DAYS} days. Try again later.`,
          nextEligibleAt: eligibility.nextEligibleAt,
        },
        { status: 429 }
      );
    }

    const boostedAt = new Date().toISOString();
    const { data: gig, error } = await supabase
      .from("gigs")
      .update({ boosted_at: boostedAt, updated_at: boostedAt })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    dispatchWebhookAsync(user.id, "gig.update", {
      gig_id: id,
      boosted_at: boostedAt,
    });

    return NextResponse.json({ gig });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
