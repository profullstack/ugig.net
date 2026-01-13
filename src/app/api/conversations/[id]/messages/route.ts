import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validations";

// GET /api/conversations/[id]/messages - Get messages in a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify conversation exists and user is participant
    const { data: conversation } = await supabase
      .from("conversations")
      .select("participant_ids")
      .eq("id", conversationId)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (!conversation.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    // Build query
    let query = supabase
      .from("messages")
      .select(
        `
        *,
        sender:profiles!sender_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: messages, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if there are more messages
    const hasMore = messages && messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages || [];

    // Mark messages as read by current user
    const unreadMessages = data.filter(
      (m) => !m.read_by?.includes(user.id) && m.sender_id !== user.id
    );

    // Update read_by for each unread message
    for (const msg of unreadMessages) {
      const readBy = msg.read_by || [];
      await supabase
        .from("messages")
        .update({ read_by: [...readBy, user.id] })
        .eq("id", msg.id);
    }

    return NextResponse.json({
      data: data.reverse(), // Return in chronological order
      hasMore,
      nextCursor: hasMore ? data[data.length - 1].created_at : null,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// POST /api/conversations/[id]/messages - Send a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify conversation exists and user is participant
    const { data: conversation } = await supabase
      .from("conversations")
      .select("participant_ids")
      .eq("id", conversationId)
      .single();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (!conversation.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validationResult = messageSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { content } = validationResult.data;

    // Create message
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        read_by: [user.id], // Sender has read their own message
      })
      .select(
        `
        *,
        sender:profiles!sender_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Create notification for recipient(s)
    const recipientIds = conversation.participant_ids.filter(
      (id: string) => id !== user.id
    );

    // Get sender info for notification
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single();

    const senderName =
      senderProfile?.full_name || senderProfile?.username || "Someone";

    for (const recipientId of recipientIds) {
      await supabase.from("notifications").insert({
        user_id: recipientId,
        type: "new_message",
        title: `New message from ${senderName}`,
        body: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
        data: {
          conversation_id: conversationId,
          message_id: message.id,
          sender_id: user.id,
        },
      });
    }

    return NextResponse.json({ data: message }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
