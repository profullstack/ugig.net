import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

// GET /api/reviews/[id] - Get a specific review
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: review, error } = await supabase
      .from("reviews")
      .select(
        `
        *,
        reviewer:profiles!reviewer_id (
          id,
          username,
          full_name,
          avatar_url
        ),
        reviewee:profiles!reviewee_id (
          id,
          username,
          full_name,
          avatar_url
        ),
        gig:gigs (
          id,
          title
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    return NextResponse.json({ data: review });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT /api/reviews/[id] - Update a review
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

    const body = await request.json();
    const validationResult = updateReviewSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("reviewer_id")
      .eq("id", id)
      .single();

    if (!existingReview) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (existingReview.reviewer_id !== user.id) {
      return NextResponse.json(
        { error: "You can only edit your own reviews" },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (validationResult.data.rating !== undefined) {
      updateData.rating = validationResult.data.rating;
    }
    if (validationResult.data.comment !== undefined) {
      updateData.comment = validationResult.data.comment;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: review, error: updateError } = await supabase
      .from("reviews")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        reviewer:profiles!reviewer_id (
          id,
          username,
          full_name,
          avatar_url
        ),
        reviewee:profiles!reviewee_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `
      )
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ data: review });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/reviews/[id] - Delete a review
export async function DELETE(
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

    // Verify ownership
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("reviewer_id")
      .eq("id", id)
      .single();

    if (!existingReview) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (existingReview.reviewer_id !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own reviews" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from("reviews")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Review deleted" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
