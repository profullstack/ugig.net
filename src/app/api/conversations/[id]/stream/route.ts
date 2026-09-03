import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";

// GET /api/conversations/[id]/stream - SSE endpoint for real-time messages
//
// This is the only route in the app that keeps a Supabase Realtime channel
// open. Everywhere else disconnects realtime the moment a client is created
// (see lib/supabase/server.ts and lib/supabase/service.ts) precisely because
// each RealtimeClient carries WebSocket state that builds up under load. That
// makes the cleanup below the only thing standing between this route and a
// process-lifetime leak, so it is written to run exactly once on every way out.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const auth = await getAuthContext(request);
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { user, supabase } = auth;

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

  // Declared out here, before anything that could need releasing exists, so
  // cleanup() is safe to call at any point -- including from the realtime
  // callback, which previously referenced `heartbeat` before it was assigned.
  let cleanedUp = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (heartbeat) clearInterval(heartbeat);
    request.signal.removeEventListener("abort", cleanup);

    try {
      channel?.unsubscribe();
    } catch {}
    try {
      // channel.unsubscribe() alone leaves the underlying RealtimeClient
      // WebSocket open, which leaks across SSE reconnects.
      supabase.realtime.disconnect();
    } catch {}
    try {
      controllerRef?.close();
    } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      // The client can disconnect while the auth and conversation lookups above
      // are still awaiting. If it does, the abort has already fired by the time
      // we get here, and a listener registered now would never be called --
      // leaving the channel and the heartbeat running for the life of the
      // process with nothing left to close them.
      //
      // That is the shape of the leak this route was actually producing. An
      // EventSource reopens automatically on every dropped connection, so a
      // client that reconnects in a loop lands here repeatedly, and each pass
      // that lost the race cost one WebSocket that was never closed again.
      if (request.signal.aborted) {
        cleanup();
        return;
      }
      request.signal.addEventListener("abort", cleanup);

      // Send initial connection message
      controller.enqueue(encoder.encode(`: connected\n\n`));

      // Subscribe to new messages via Supabase Realtime
      channel = supabase
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
            // Nothing to deliver to, and more importantly nothing to hold: a
            // payload enqueued onto a stream no one is reading just sits in the
            // queue.
            if (cleanedUp) return;

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
              try {
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              } catch {
                cleanup();
              }
            }
          }
        )
        .subscribe();

      // Heartbeat to keep connection alive
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, 30000);
    },

    // The runtime calls this when the consumer goes away, which does not always
    // coincide with the request signal aborting. Without it, a cancelled stream
    // kept its channel and its interval and there was no second chance to
    // notice -- the heartbeat's enqueue does not reliably throw on a stream
    // that was cancelled rather than closed.
    cancel() {
      cleanup();
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
