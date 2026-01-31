import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/gigs/[id]/applications - Get applications for a gig (poster only)
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
    const { user, supabase } = auth;

    // Check if user owns the gig
    const { data: gig } = await supabase
      .from("gigs")
      .select("poster_id, title")
      .eq("id", id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (gig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get applications with applicant info
    const { data: applications, error } = await supabase
      .from("applications")
      .select(
        `
        *,
        applicant:profiles!applicant_id (
          id,
          username,
          full_name,
          avatar_url,
          bio,
          skills,
          ai_tools,
          hourly_rate,
          portfolio_urls,
          is_available
        )
      `
      )
      .eq("gig_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      gig: { id, title: gig.title },
      applications,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
