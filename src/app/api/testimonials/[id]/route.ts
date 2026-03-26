import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { id } = await params;

    const body = await request.json();
    const { status, content, rating } = body;

    const serviceClient = createServiceClient();

    // Fetch the testimonial to check ownership
    const { data: testimonial, error: fetchError } = await serviceClient
      .from("testimonials")
      .select("id, profile_id, gig_id, author_id")
      .eq("id", id)
      .single();

    if (fetchError || !testimonial) {
      return NextResponse.json(
        { error: "Testimonial not found" },
        { status: 404 }
      );
    }

    // Author editing their own testimonial (content/rating)
    if (content !== undefined || rating !== undefined) {
      if (testimonial.author_id !== user.id) {
        return NextResponse.json(
          { error: "Only the author can edit testimonial content" },
          { status: 403 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (content !== undefined) {
        if (typeof content !== "string" || content.trim().length < 10) {
          return NextResponse.json({ error: "Content must be at least 10 characters" }, { status: 400 });
        }
        if (content.length > 2000) {
          return NextResponse.json({ error: "Content must be under 2000 characters" }, { status: 400 });
        }
        updateData.content = content.trim();
      }
      if (rating !== undefined) {
        if (typeof rating !== "number" || rating < 1 || rating > 5) {
          return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
        }
        updateData.rating = rating;
      }
      // Editing resets to pending for re-approval
      updateData.status = "pending";

      const { data, error } = await serviceClient
        .from("testimonials")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Failed to update testimonial" }, { status: 400 });
      }

      return NextResponse.json({ testimonial: data });
    }

    // Profile/gig owner managing status (approve/reject)
    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    let hasPermission = false;
    if (testimonial.profile_id && testimonial.profile_id === user.id) {
      hasPermission = true;
    } else if (testimonial.gig_id) {
      const { data: gig } = await serviceClient
        .from("gigs")
        .select("poster_id")
        .eq("id", testimonial.gig_id)
        .single();
      if (gig && gig.poster_id === user.id) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      return NextResponse.json(
        { error: "You don't have permission to manage this testimonial" },
        { status: 403 }
      );
    }

    const { data, error } = await serviceClient
      .from("testimonials")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Failed to update testimonial" },
        { status: 400 }
      );
    }

    return NextResponse.json({ testimonial: data });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;
    const { id } = await params;

    // RLS ensures only author can delete
    const { error } = await createServiceClient()
      .from("testimonials")
      .delete()
      .eq("id", id)
      .eq("author_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
