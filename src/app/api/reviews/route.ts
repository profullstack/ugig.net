import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createReviewSchema = z.object({
  gig_id: z.string().uuid("Invalid gig ID"),
  reviewee_id: z.string().uuid("Invalid reviewee ID"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

// GET /api/reviews - Get reviews for a gig
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const gigId = searchParams.get("gig_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
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
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (gigId) {
      query = query.eq("gig_id", gigId);
    }

    const { data: reviews, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: reviews,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/reviews - Create a new review
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
    const validationResult = createReviewSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id, reviewee_id, rating, comment } = validationResult.data;

    // Prevent self-reviews
    if (reviewee_id === user.id) {
      return NextResponse.json(
        { error: "You cannot review yourself" },
        { status: 400 }
      );
    }

    // Verify gig exists and user is involved (poster or accepted applicant)
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, poster_id, status")
      .eq("id", gig_id)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    // Check if user is the poster
    const isPoster = gig.poster_id === user.id;

    // Check if user is an accepted applicant
    const { data: application } = await supabase
      .from("applications")
      .select("id")
      .eq("gig_id", gig_id)
      .eq("applicant_id", user.id)
      .eq("status", "accepted")
      .single();

    const isAcceptedApplicant = !!application;

    if (!isPoster && !isAcceptedApplicant) {
      return NextResponse.json(
        { error: "You can only review gigs you're involved in" },
        { status: 403 }
      );
    }

    // Verify reviewee is involved in the gig
    const revieweeIsPoster = gig.poster_id === reviewee_id;
    const { data: revieweeApplication } = await supabase
      .from("applications")
      .select("id")
      .eq("gig_id", gig_id)
      .eq("applicant_id", reviewee_id)
      .eq("status", "accepted")
      .single();

    const revieweeIsAcceptedApplicant = !!revieweeApplication;

    if (!revieweeIsPoster && !revieweeIsAcceptedApplicant) {
      return NextResponse.json(
        { error: "Reviewee is not involved in this gig" },
        { status: 400 }
      );
    }

    // Check for existing review
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("gig_id", gig_id)
      .eq("reviewer_id", user.id)
      .eq("reviewee_id", reviewee_id)
      .single();

    if (existingReview) {
      return NextResponse.json(
        { error: "You have already reviewed this user for this gig" },
        { status: 400 }
      );
    }

    // Create review
    const { data: review, error: createError } = await supabase
      .from("reviews")
      .insert({
        gig_id,
        reviewer_id: user.id,
        reviewee_id,
        rating,
        comment,
      })
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

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Create notification for reviewee
    await supabase.from("notifications").insert({
      user_id: reviewee_id,
      type: "review_received",
      title: "New review received",
      body: `You received a ${rating}-star review`,
      data: {
        review_id: review.id,
        gig_id,
        rating,
      },
    });

    return NextResponse.json({ data: review }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
