import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PUT /api/messages/[id]/read - Mark a message as read
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the message to verify participant access
    const { data: message } = await supabase
      .from("messages")
      .select("id, conversation_id, read_by")
      .eq("id", messageId)
      .single();

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Verify user is participant in conversation
    const { data: conversation } = await supabase
      .from("conversations")
      .select("participant_ids")
      .eq("id", message.conversation_id)
      .single();

    if (!conversation?.participant_ids.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Add user to read_by if not already there
    const readBy = message.read_by || [];
    if (!readBy.includes(user.id)) {
      const { error } = await supabase
        .from("messages")
        .update({ read_by: [...readBy, user.id] })
        .eq("id", messageId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
