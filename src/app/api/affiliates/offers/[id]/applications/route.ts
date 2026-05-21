import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

type AnySupabase = any;

/**
 * GET /api/affiliates/offers/[id]/applications - List affiliates for an offer (seller only)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceClient();

    // Verify seller ownership
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!offer || offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });
    }

    const { data: applications, error } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select(
        `
        *,
        profiles!affiliate_applications_affiliate_id_fkey(username, avatar_url)
      `
      )
      .eq("offer_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ applications: applications || [] });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

/**
 * PATCH /api/affiliates/offers/[id]/applications - Approve/reject an application
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { application_id, action } = body as Record<string, unknown>;

    if (typeof application_id !== "string" || !["approve", "reject"].includes(action as string)) {
      return NextResponse.json(
        { error: "application_id and action (approve|reject) required" },
        { status: 400 }
      );
    }

    const admin = createServiceClient();

    // Verify seller ownership
    const { data: offer } = await (admin as AnySupabase)
      .from("affiliate_offers")
      .select("id, seller_id")
      .eq("id", id)
      .single();

    if (!offer || offer.seller_id !== auth.user.id) {
      return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });
    }

    const status = action === "approve" ? "approved" : "rejected";
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "approved") {
      updateData.approved_at = new Date().toISOString();
    }

    const { data: application, error } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .update(updateData)
      .eq("id", application_id)
      .eq("offer_id", id)
      .select(`*, profiles!affiliate_applications_affiliate_id_fkey(username)`)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Notify affiliate. The status update already succeeded, so notification
    // delivery should not make the API report a failed approval/rejection.
    const notificationType = status === "approved" ? "affiliate_approved" : "affiliate_rejected";
    try {
      const { error: notificationError } = await (admin as AnySupabase)
        .from("notifications")
        .insert({
          user_id: application.affiliate_id,
          type: notificationType,
          title:
            status === "approved"
              ? "Affiliate application approved! 🎉"
              : "Affiliate application declined",
          body:
            status === "approved"
              ? `You've been approved to promote this offer. Your tracking link is ready!`
              : "Your affiliate application was not approved.",
          data: { offer_id: id, application_id },
        });

      if (notificationError) {
        console.warn("Failed to create affiliate application notification", notificationError);
      }
    } catch (error) {
      console.warn("Failed to create affiliate application notification", error);
    }

    return NextResponse.json({ application });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
