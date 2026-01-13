import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const saveGigSchema = z.object({
  gig_id: z.string().uuid("Invalid gig ID"),
});

// GET /api/saved-gigs - List user's saved gigs
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

    const { data: savedGigs, error } = await supabase
      .from("saved_gigs")
      .select(
        `
        id,
        created_at,
        gig:gigs (
          id,
          title,
          description,
          category,
          skills_required,
          ai_tools_preferred,
          budget_type,
          budget_min,
          budget_max,
          duration,
          location_type,
          location,
          status,
          created_at,
          poster:profiles!poster_id (
            id,
            username,
            full_name,
            avatar_url
          )
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Filter out closed/deleted gigs and transform response
    const activeGigs = savedGigs
      .filter(
        (sg) => sg.gig && (sg.gig as { status: string }).status === "active"
      )
      .map((sg) => ({
        saved_id: sg.id,
        saved_at: sg.created_at,
        ...sg.gig,
      }));

    return NextResponse.json({ gigs: activeGigs });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/saved-gigs - Save a gig
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
    const validationResult = saveGigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id } = validationResult.data;

    // Check if gig exists and is active
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, status, poster_id")
      .eq("id", gig_id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (gig.status !== "active") {
      return NextResponse.json(
        { error: "Can only save active gigs" },
        { status: 400 }
      );
    }

    // Can't save your own gig
    if (gig.poster_id === user.id) {
      return NextResponse.json(
        { error: "Cannot save your own gig" },
        { status: 400 }
      );
    }

    // Check if already saved
    const { data: existing } = await supabase
      .from("saved_gigs")
      .select("id")
      .eq("user_id", user.id)
      .eq("gig_id", gig_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Gig already saved" },
        { status: 409 }
      );
    }

    const { data: savedGig, error } = await supabase
      .from("saved_gigs")
      .insert({
        user_id: user.id,
        gig_id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ saved: savedGig }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/saved-gigs - Unsave a gig (with gig_id in body)
export async function DELETE(request: NextRequest) {
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
    const validationResult = saveGigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id } = validationResult.data;

    const { error } = await supabase
      .from("saved_gigs")
      .delete()
      .eq("user_id", user.id)
      .eq("gig_id", gig_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Gig unsaved successfully" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
