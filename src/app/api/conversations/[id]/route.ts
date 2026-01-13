import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/conversations/[id] - Get conversation details
export async function GET(
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

    // Get conversation
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        gig:gigs (
          id,
          title,
          status
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Verify user is a participant
    if (!conversation.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get participant profiles
    const { data: participants } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .in("id", conversation.participant_ids);

    return NextResponse.json({
      data: {
        ...conversation,
        participants: participants || [],
      },
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
