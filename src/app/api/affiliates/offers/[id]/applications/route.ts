import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

type AnySupabase = any;

async function readJsonObject(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * GET /api/affiliates/offers/[id]/applications - List affiliates for an offer (seller only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      .select(`
        *,
        profiles!affiliate_applications_affiliate_id_fkey(username, avatar_url)
      `)
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
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const application_id = typeof body.application_id === "string" ? body.application_id : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!application_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "application_id and action (approve|reject) required" }, { status: 400 });
    }

    const status = action === "approve" ? "approved" : "rejected";

    const admin = createServiceClient();
    const { data: moderatedApplication, error } = await (admin as AnySupabase)
      .rpc("moderate_affiliate_application", {
        p_offer_id: id,
        p_application_id: application_id,
        p_seller_id: auth.user.id,
        p_status: status,
      });

    if (error) {
      const statusCode =
        error.message === "Not found or not authorized" ||
        error.message === "Application not found"
          ? 404
          : 400;
      return NextResponse.json({ error: error.message }, { status: statusCode });
    }

    const { data: application } = await (admin as AnySupabase)
      .from("affiliate_applications")
      .select(`*, profiles!affiliate_applications_affiliate_id_fkey(username)`)
      .eq("id", application_id)
      .eq("offer_id", id)
      .single();

    const responseApplication = application || moderatedApplication;

    // Notify affiliate
    const notificationType = status === "approved" ? "affiliate_approved" : "affiliate_rejected";
    await (admin as AnySupabase)
      .from("notifications")
      .insert({
        user_id: responseApplication.affiliate_id,
        type: notificationType,
        title: status === "approved" ? "Affiliate application approved! 🎉" : "Affiliate application declined",
        body: status === "approved"
          ? `You've been approved to promote this offer. Your tracking link is ready!`
          : "Your affiliate application was not approved.",
        data: { offer_id: id, application_id },
      });

    return NextResponse.json({ application: responseApplication });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
