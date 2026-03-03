import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-user";
import { checkRateLimit, rateLimitExceeded, getRateLimitIdentifier } from "@/lib/rate-limit";

/**
 * POST /api/gigs/[id]/messages - Start or continue a conversation about a gig
 *
 * Creates a conversation with the gig poster (or returns existing one) and sends
 * the initial message. Designed for programmatic/agent use.
 *
 * Body: { message: string }
 * Returns: { conversation_id, message_id, created_at }
 *
 * Fixes #14
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const rl = checkRateLimit(getRateLimitIdentifier(request, user.id), "write");
    if (!rl.allowed) return rateLimitExceeded(rl);

    const body = await request.json();
    const messageContent = body.message;

    if (!messageContent || typeof messageContent !== "string" || messageContent.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (messageContent.length > 5000) {
      return NextResponse.json(
        { error: "Message must be at most 5000 characters" },
        { status: 400 }
      );
    }

    // Get the gig and poster info
    const { data: gig } = await supabase
      .from("gigs")
      .select("id, poster_id, title, status")
      .eq("id", gigId)
      .single();

    if (!gig) {
      return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    }

    if (gig.poster_id === user.id) {
      return NextResponse.json(
        { error: "Cannot message yourself about your own gig" },
        { status: 400 }
      );
    }

    // Authorization: caller must have an application for this gig (or be poster, caught above)
    const { data: application } = await supabase
      .from("applications")
      .select("id")
      .eq("gig_id", gigId)
      .eq("applicant_id", user.id)
      .single();

    if (!application) {
      return NextResponse.json(
        { error: "You must apply to this gig before messaging the poster" },
        { status: 403 }
      );
    }

    const participantIds = [user.id, gig.poster_id].sort();

    // Check for existing conversation about this gig between these users
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("gig_id", gigId)
      .contains("participant_ids", participantIds)
      .single();

    let conversationId: string;

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          participant_ids: participantIds,
          gig_id: gigId,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (convError || !newConv) {
        return NextResponse.json(
          { error: convError?.message || "Failed to create conversation" },
          { status: 400 }
        );
      }

      conversationId = newConv.id;
    }

    // Send the message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent.trim(),
        read_by: [user.id],
      })
      .select("id, created_at")
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { error: msgError?.message || "Failed to send message" },
        { status: 400 }
      );
    }

    // Update conversation last_message_at
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Create notification for gig poster
    await supabase.from("notifications").insert({
      user_id: gig.poster_id,
      type: "new_message",
      title: "New message",
      body: `New message about "${gig.title}"`,
      data: { conversation_id: conversationId, gig_id: gigId },
    });

    return NextResponse.json(
      {
        conversation_id: conversationId,
        message_id: message.id,
        created_at: message.created_at,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
