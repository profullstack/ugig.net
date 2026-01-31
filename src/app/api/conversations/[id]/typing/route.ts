import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// In-memory store for typing status (in production, use Redis)
// Map<conversationId, Map<userId, timestamp>>
const typingStatus = new Map<string, Map<string, number>>();

// Clean up old typing statuses (older than 5 seconds)
function cleanupOldStatuses() {
  const now = Date.now();
  for (const [conversationId, users] of typingStatus.entries()) {
    for (const [userId, timestamp] of users.entries()) {
      if (now - timestamp > 5000) {
        users.delete(userId);
      }
    }
    if (users.size === 0) {
      typingStatus.delete(conversationId);
    }
  }
}

// POST /api/conversations/[id]/typing - Send typing status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Verify user is participant in the conversation
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

    // Update typing status
    if (!typingStatus.has(conversationId)) {
      typingStatus.set(conversationId, new Map());
    }
    typingStatus.get(conversationId)!.set(user.id, Date.now());

    // Clean up old statuses periodically
    cleanupOldStatuses();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// GET /api/conversations/[id]/typing - Get typing users
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // Verify user is participant
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

    // Clean up and get typing users (excluding current user)
    cleanupOldStatuses();
    const typingUsers: string[] = [];
    const conversationTyping = typingStatus.get(conversationId);
    if (conversationTyping) {
      for (const [userId] of conversationTyping.entries()) {
        if (userId !== user.id) {
          typingUsers.push(userId);
        }
      }
    }

    return NextResponse.json({ typing: typingUsers });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// Export for use in SSE stream
export { typingStatus };
