import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import {
  checkForHireAdActivation,
  computeExpiresAt,
  expiryDaysFor,
  limitResponse,
} from "@/lib/limits";

const RENEWABLE_STATUSES = new Set(["active", "paused", "archived"]);

/**
 * POST /api/gigs/[id]/renew - "Renew for 30 days" (60 for a for_hire ad).
 *
 * Owner only. Sets expires_at to now + the listing window and the status to
 * active, so a gig the expire-gigs cron paused goes back on the board. An
 * active gig can be renewed early to push its date out. Drafts are published
 * through the status route instead, and closed/filled gigs stay closed.
 *
 * An archived gig (archive-stale cron, or the owner) is reactivated the same
 * way. One that was a draft when it was archived goes back to being a draft.
 */
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

    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id, status, listing_type, title, archived_from_status")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }
    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!RENEWABLE_STATUSES.has(existingGig.status)) {
      return NextResponse.json(
        {
          error:
            existingGig.status === "draft"
              ? "This gig is a draft. Publish it instead of renewing it."
              : `A ${existingGig.status} gig cannot be renewed. Post a new gig instead.`,
        },
        { status: 409 }
      );
    }

    if (existingGig.status === "archived" && existingGig.archived_from_status === "draft") {
      const { data: draft, error: draftError } = await supabase
        .from("gigs")
        .update({ status: "draft", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (draftError) {
        return NextResponse.json({ error: draftError.message }, { status: 400 });
      }
      return NextResponse.json({ gig: draft, renewed_days: 0, restored_to: "draft" });
    }

    if (existingGig.status !== "active" && existingGig.listing_type === "for_hire") {
      const activation = await checkForHireAdActivation(
        supabase,
        user.id,
        existingGig.title || "",
        id
      );
      if (!activation.ok) return limitResponse(activation);
    }

    const now = new Date();
    const { data: gig, error } = await supabase
      .from("gigs")
      .update({
        status: "active",
        expires_at: computeExpiresAt(existingGig.listing_type, now),
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (existingGig.status !== "active") {
      dispatchWebhookAsync(user.id, "gig.update", {
        gig_id: id,
        old_status: existingGig.status,
        new_status: "active",
      });
    }

    return NextResponse.json({
      gig,
      renewed_days: expiryDaysFor(existingGig.listing_type),
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
