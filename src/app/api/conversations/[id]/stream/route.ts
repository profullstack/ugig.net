import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/conversations/[id]/stream - SSE endpoint for real-time messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify conversation exists and user is participant
  const { data: conversation } = await supabase
    .from("conversations")
    .select("participant_ids")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return new Response("Conversation not found", { status: 404 });
  }

  if (!conversation.participant_ids.includes(user.id)) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`: connected\n\n`));

      // Subscribe to new messages via Supabase Realtime
      const channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          async (payload) => {
            // Fetch the full message with sender info
            const { data: message } = await supabase
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
              .eq("id", payload.new.id)
              .single();

            if (message) {
              const data = JSON.stringify(message);
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
        )
        .subscribe();

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Stream might be closed
          clearInterval(heartbeat);
        }
      }, 30000);

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        channel.unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream might already be closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
