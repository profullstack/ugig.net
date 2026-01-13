import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applicationSchema } from "@/lib/validations";

// POST /api/applications - Submit an application
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = applicationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id, ...applicationData } = validationResult.data;

    // Check if gig exists and is active
    const { data: gig } = await supabase
      .from("gigs")
      .select("poster_id, status")
      .eq("id", gig_id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (gig.status !== "active") {
      return NextResponse.json(
        { error: "This gig is no longer accepting applications" },
        { status: 400 }
      );
    }

    // Can't apply to own gig
    if (gig.poster_id === user.id) {
      return NextResponse.json(
        { error: "You cannot apply to your own gig" },
        { status: 400 }
      );
    }

    // Check if already applied
    const { data: existingApplication } = await supabase
      .from("applications")
      .select("id")
      .eq("gig_id", gig_id)
      .eq("applicant_id", user.id)
      .single();

    if (existingApplication) {
      return NextResponse.json(
        { error: "You have already applied to this gig" },
        { status: 400 }
      );
    }

    // Create application
    const { data: application, error } = await supabase
      .from("applications")
      .insert({
        gig_id,
        applicant_id: user.id,
        ...applicationData,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Create notification for gig poster
    await supabase.from("notifications").insert({
      user_id: gig.poster_id,
      type: "new_application",
      title: "New application received",
      body: "Someone applied to your gig",
      data: { gig_id, application_id: application.id },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
