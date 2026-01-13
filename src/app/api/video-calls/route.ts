import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { nanoid } from "nanoid";

const createVideoCallSchema = z.object({
  participant_id: z.string().uuid("Invalid participant ID"),
  gig_id: z.string().uuid("Invalid gig ID").optional(),
  application_id: z.string().uuid("Invalid application ID").optional(),
  scheduled_at: z.string().datetime().optional(),
});

// GET /api/video-calls - List user's video calls
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const upcoming = searchParams.get("upcoming") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    let query = supabase
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
      .or(`initiator_id.eq.${user.id},participant_ids.cs.{${user.id}}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (upcoming) {
      // Get scheduled calls that haven't started yet
      query = query
        .is("started_at", null)
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", new Date().toISOString());
    }

    const { data: calls, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Fetch participant profiles
    const participantIds = new Set<string>();
    calls?.forEach((call) => {
      participantIds.add(call.initiator_id);
      call.participant_ids.forEach((id: string) => participantIds.add(id));
    });

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", Array.from(participantIds));

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    const callsWithProfiles = calls?.map((call) => ({
      ...call,
      initiator: profileMap.get(call.initiator_id),
      participants: call.participant_ids.map((id: string) => profileMap.get(id)),
    }));

    return NextResponse.json({ data: callsWithProfiles });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/video-calls - Create a new video call
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
    const validationResult = createVideoCallSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { participant_id, gig_id, application_id, scheduled_at } =
      validationResult.data;

    // Verify participant exists
    const { data: participant } = await supabase
      .from("profiles")
      .select("id, username, full_name")
      .eq("id", participant_id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Participant not found" },
        { status: 404 }
      );
    }

    // Prevent self-calls
    if (participant_id === user.id) {
      return NextResponse.json(
        { error: "Cannot create a call with yourself" },
        { status: 400 }
      );
    }

    // Generate unique room ID
    const roomId = `ugig-${nanoid(12)}`;

    // Create video call
    const { data: call, error: createError } = await supabase
      .from("video_calls")
      .insert({
        room_id: roomId,
        initiator_id: user.id,
        participant_ids: [participant_id],
        gig_id,
        application_id,
        scheduled_at,
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Create notification for participant
    await supabase.from("notifications").insert({
      user_id: participant_id,
      type: "call_scheduled",
      title: scheduled_at ? "Video call scheduled" : "Video call invitation",
      body: scheduled_at
        ? `A video call has been scheduled for ${new Date(scheduled_at).toLocaleString()}`
        : "You've been invited to a video call",
      data: {
        video_call_id: call.id,
        room_id: roomId,
        gig_id,
        scheduled_at,
      },
    });

    return NextResponse.json({ data: call }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
