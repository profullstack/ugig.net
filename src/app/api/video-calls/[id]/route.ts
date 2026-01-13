import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/video-calls/[id] - Get video call details
export async function GET(
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

    const { data: call, error } = await supabase
      .from("video_calls")
      .select(
        `
        *,
        gig:gigs (
          id,
          title
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !call) {
      return NextResponse.json(
        { error: "Video call not found" },
        { status: 404 }
      );
    }

    // Verify user is participant
    if (
      call.initiator_id !== user.id &&
      !call.participant_ids.includes(user.id)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch participant profiles
    const participantIds = [call.initiator_id, ...call.participant_ids];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", participantIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    return NextResponse.json({
      data: {
        ...call,
        initiator: profileMap.get(call.initiator_id),
        participants: call.participant_ids.map((id: string) =>
          profileMap.get(id)
        ),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PATCH /api/video-calls/[id] - Update video call (start, end)
export async function PATCH(
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
    const { action } = body;

    // Get current call
    const { data: call, error: fetchError } = await supabase
      .from("video_calls")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !call) {
      return NextResponse.json(
        { error: "Video call not found" },
        { status: 404 }
      );
    }

    // Verify user is participant
    if (
      call.initiator_id !== user.id &&
      !call.participant_ids.includes(user.id)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let updateData: Record<string, string> = {};

    if (action === "start") {
      if (call.started_at) {
        return NextResponse.json(
          { error: "Call already started" },
          { status: 400 }
        );
      }
      updateData = { started_at: new Date().toISOString() };
    } else if (action === "end") {
      if (!call.started_at) {
        return NextResponse.json(
          { error: "Call has not started yet" },
          { status: 400 }
        );
      }
      if (call.ended_at) {
        return NextResponse.json(
          { error: "Call already ended" },
          { status: 400 }
        );
      }
      updateData = { ended_at: new Date().toISOString() };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { data: updatedCall, error: updateError } = await supabase
      .from("video_calls")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ data: updatedCall });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE /api/video-calls/[id] - Cancel video call
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

    // Get call to verify ownership
    const { data: call, error: fetchError } = await supabase
      .from("video_calls")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !call) {
      return NextResponse.json(
        { error: "Video call not found" },
        { status: 404 }
      );
    }

    // Only initiator can delete
    if (call.initiator_id !== user.id) {
      return NextResponse.json(
        { error: "Only the initiator can cancel this call" },
        { status: 403 }
      );
    }

    // Can't delete started calls
    if (call.started_at && !call.ended_at) {
      return NextResponse.json(
        { error: "Cannot cancel an ongoing call" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from("video_calls")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Video call canceled" });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
