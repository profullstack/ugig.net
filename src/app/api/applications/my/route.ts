import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/applications/my - Get current user's applications
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: applications, error } = await supabase
      .from("applications")
      .select(
        `
        *,
        gig:gigs (
          id,
          title,
          status,
          budget_type,
          budget_min,
          budget_max,
          poster:profiles!poster_id (
            id,
            username,
            full_name,
            avatar_url
          )
        )
      `
      )
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ applications });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
