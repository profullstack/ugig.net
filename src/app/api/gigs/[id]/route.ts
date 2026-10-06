import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gigSchema } from "@/lib/validations";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import {
  HIRED_APPLICATION_STATUSES,
  OPEN_APPLICATION_STATUSES,
} from "@/lib/application-status";
import { HELD_COLUMN } from "@/lib/limits";
import { usersAreBlocked } from "@/lib/blocks";
import { checkForHireAdActivation, computeExpiresAt, limitResponse } from "@/lib/limits";

// GET /api/gigs/[id] - Get a single gig
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: gig, error } = await supabase
      .from("gigs")
      .select(
        `
        *,
        poster:profiles!poster_id (
          id,
          username,
          full_name,
          avatar_url,
          bio,
          skills,
          ai_tools,
          is_available,
          account_type,
          agent_name,
          verified,
          verification_type
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // A blocked poster's gig reads as missing rather than hidden, so the 404 says
    // nothing about who blocked whom.
    const auth = await getAuthContext(request);
    if (
      auth &&
      gig.poster_id &&
      auth.user.id !== gig.poster_id &&
      (await usersAreBlocked(auth.supabase, auth.user.id, gig.poster_id))
    ) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Increment view count atomically (#83)
    // Use RPC if available, fallback to standard update
    const { error: rpcError } = await supabase.rpc("increment_gig_views" as any, { gig_id: id });
    if (rpcError) {
      // Fallback: standard update (still better than client-computed increment)
      await supabase
        .from("gigs")
        .update({ views_count: (gig.views_count || 0) + 1 })
        .eq("id", id);
    }

    return NextResponse.json({ gig });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT /api/gigs/[id] - Update a gig
export async function PUT(
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

    // Check ownership
    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id, status, listing_type, title")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = gigSchema.partial().safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    // The edit form can publish or re-activate a gig through PUT, so an ad
    // going live (or a live ad getting a new title or type) meets the same
    // caps as POST /api/gigs, and activation restarts the expiry window.
    const update = validationResult.data;
    const nextStatus = update.status ?? existingGig.status;
    const nextListingType = update.listing_type ?? existingGig.listing_type;
    const nextTitle = update.title ?? existingGig.title ?? "";
    const isActivation = nextStatus === "active" && existingGig.status !== "active";
    if (
      nextStatus === "active" &&
      nextListingType === "for_hire" &&
      (isActivation ||
        existingGig.listing_type !== "for_hire" ||
        (update.title !== undefined && update.title !== existingGig.title))
    ) {
      const activation = await checkForHireAdActivation(supabase, user.id, nextTitle, id);
      if (!activation.ok) return limitResponse(activation);
    }

    const { data: gig, error } = await supabase
      .from("gigs")
      .update({
        ...update,
        ...(isActivation ? { expires_at: computeExpiresAt(nextListingType) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ gig });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/gigs/[id] - Delete a gig
export async function DELETE(
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

    // Check ownership
    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id, title")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The service client sees every application and invoice on the gig
    // regardless of RLS, and is the only writer allowed to insert
    // notifications for other users.
    const svc = createServiceClient();

    // A gig with a hire or an unpaid invoice is someone's live work: deleting
    // it would cascade away the record they need to get paid.
    const { count: hiredCount, error: hiredError } = await svc
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("gig_id", id)
      .in("status", [...HIRED_APPLICATION_STATUSES]);

    if (hiredError) {
      return NextResponse.json({ error: hiredError.message }, { status: 500 });
    }
    if ((hiredCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "This gig has a hired worker, so it can't be deleted. Close it or mark it filled instead.",
        },
        { status: 409 }
      );
    }

    // gig_invoices is not in the hand-maintained Database types.
    const { count: unpaidInvoices, error: invoiceError } = await (svc as any)
      .from("gig_invoices")
      .select("id", { count: "exact", head: true })
      .eq("gig_id", id)
      .eq("status", "sent");

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }
    if ((unpaidInvoices ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "This gig has an unpaid invoice, so it can't be deleted. Pay or reject the invoice first.",
        },
        { status: 409 }
      );
    }

    // Everyone still waiting on this gig gets one in-app notice. Read the
    // open applications now: they are deleted along with the gig.
    const { data: openApplications } = await svc
      .from("applications")
      .select("id, applicant_id")
      .eq("gig_id", id)
      .in("status", [...OPEN_APPLICATION_STATUSES])
      .is(HELD_COLUMN, null);

    const gigTitle = existingGig.title || "A gig you applied to";
    const notifications = (openApplications ?? []).map((app) => ({
      user_id: app.applicant_id,
      type: "application_status" as const,
      title: "Gig removed",
      body: `"${gigTitle}" was removed by the poster, so your application is closed.`,
      data: { gig_id: id, application_id: app.id, status: "gig_removed" },
    }));

    const { error } = await supabase.from("gigs").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Sent only once the delete has succeeded, so a failed delete never tells
    // anyone their application is closed.
    if (notifications.length > 0) {
      const { error: notifyError } = await svc.from("notifications").insert(notifications);
      if (notifyError) {
        console.error("[gig-delete] failed to notify applicants:", notifyError);
      }
    }

    return NextResponse.json({ message: "Gig deleted successfully" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
