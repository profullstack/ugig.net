import { NextRequest, NextResponse } from "next/server";
import { conversationCreateSchema } from "@/lib/validations";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/conversations - List user's conversations
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Get conversations where user is a participant
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select(
        `
        *,
        gig:gigs (
          id,
          title
        )
      `
      )
      .contains("participant_ids", [user.id])
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Fetch participant profiles and last message for each conversation
    const conversationsWithDetails = await Promise.all(
      (conversations || []).map(async (conv) => {
        // Get participant profiles
        const { data: participants } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .in("id", conv.participant_ids);

        // Get last message
        const { data: lastMessages } = await supabase
          .from("messages")
          .select("content, sender_id, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        // Count unread messages (messages not in read_by for current user)
        const { count: unreadCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .not("read_by", "cs", `{${user.id}}`);

        return {
          ...conv,
          participants: participants || [],
          last_message: lastMessages?.[0] || null,
          unread_count: unreadCount || 0,
        };
      })
    );

    return NextResponse.json({ data: conversationsWithDetails });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/conversations - Create a conversation
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = conversationCreateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { gig_id, recipient_id } = validationResult.data;

    // Can't message yourself
    if (recipient_id === user.id) {
      return NextResponse.json(
        { error: "Cannot start conversation with yourself" },
        { status: 400 }
      );
    }

    // Verify recipient exists
    const { data: recipient } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", recipient_id)
      .single();

    if (!recipient) {
      return NextResponse.json(
        { error: "Recipient not found" },
        { status: 404 }
      );
    }

    const participantIds = [user.id, recipient_id].sort();

    if (gig_id) {
      // === GIG-SCOPED CONVERSATION ===

      // Verify gig exists
      const { data: gig } = await supabase
        .from("gigs")
        .select("id, poster_id")
        .eq("id", gig_id)
        .single();

      if (!gig) {
        return NextResponse.json({ error: "Gig not found" }, { status: 404 });
      }

      // Verify user is either the poster or has an application for this gig
      const isPoster = gig.poster_id === user.id;
      let isApplicant = false;

      if (!isPoster) {
        const { data: application } = await supabase
          .from("applications")
          .select("id")
          .eq("gig_id", gig_id)
          .eq("applicant_id", user.id)
          .single();

        isApplicant = !!application;
      }

      if (!isPoster && !isApplicant) {
        return NextResponse.json(
          { error: "Must be gig poster or applicant to start conversation" },
          { status: 403 }
        );
      }

      // Check for existing conversation between these users for this gig
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("*")
        .eq("gig_id", gig_id)
        .contains("participant_ids", participantIds)
        .single();

      if (existingConv) {
        return NextResponse.json({ data: existingConv });
      }

      // Create gig-scoped conversation
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          participant_ids: participantIds,
          gig_id,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ data: conversation }, { status: 201 });
    } else {
      // === DIRECT MESSAGE (no gig context) ===

      // Check for existing direct conversation (gig_id IS NULL)
      const { data: existingConvs } = await supabase
        .from("conversations")
        .select("*")
        .is("gig_id", null)
        .contains("participant_ids", participantIds);

      if (existingConvs && existingConvs.length > 0) {
        return NextResponse.json({ data: existingConvs[0] });
      }

      // Create direct conversation
      const { data: conversation, error } = await supabase
        .from("conversations")
        .insert({
          participant_ids: participantIds,
          gig_id: null,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ data: conversation }, { status: 201 });
    }
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
