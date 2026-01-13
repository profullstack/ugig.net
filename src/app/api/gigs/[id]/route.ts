import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gigSchema } from "@/lib/validations";

// GET /api/gigs/[id] - Get a single gig
export async function GET(
  _request: NextRequest,
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
          is_available
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Increment view count
    await supabase
      .from("gigs")
      .update({ views_count: gig.views_count + 1 })
      .eq("id", id);

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
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ownership
    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = gigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data: gig, error } = await supabase
      .from("gigs")
      .update({
        ...validationResult.data,
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ownership
    const { data: existingGig } = await supabase
      .from("gigs")
      .select("poster_id")
      .eq("id", id)
      .single();

    if (!existingGig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (existingGig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("gigs").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Gig deleted successfully" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
