import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getAuthContext } from "@/lib/auth/get-user";
import { sendEmail, newMessageEmail } from "@/lib/email";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { isEmailNotificationEnabled } from "@/lib/notification-settings";
import { z } from "zod";

const sendMessageSchema = z.object({
  recipient: z.string().min(1, "Recipient username is required"),
  content: z.string().min(1, "Message content is required").max(5000, "Message too long"),
});

// POST /api/messages/send - Send a DM by username (creates conversation if needed)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const body = await request.json();
    const validationResult = sendMessageSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { recipient, content } = validationResult.data;

    // Look up recipient by username
    const { data: recipientProfile, error: recipientError } = await supabase
      .from("profiles")
      .select("id, full_name, username, last_active_at")
      .eq("username", recipient)
      .single();

    if (recipientError || !recipientProfile) {
      return NextResponse.json(
        { error: "Recipient not found" },
        { status: 404 }
      );
    }

    if (recipientProfile.id === user.id) {
      return NextResponse.json(
        { error: "Cannot send a message to yourself" },
        { status: 400 }
      );
    }

    // Find or create a direct conversation (gig_id IS NULL) between sender and recipient
    const participantIds = [user.id, recipientProfile.id].sort();

    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id, participant_ids")
      .is("gig_id", null)
      .contains("participant_ids", participantIds)
      .single();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      // Create a new direct conversation
      const { data: newConversation, error: createError } = await supabase
        .from("conversations")
        .insert({
          participant_ids: participantIds,
          gig_id: null,
        })
        .select("id")
        .single();

      if (createError || !newConversation) {
        return NextResponse.json(
          { error: "Failed to create conversation" },
          { status: 500 }
        );
      }

      conversationId = newConversation.id;
    }

    // Create message
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        read_by: [user.id],
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

    if (messageError || !message) {
      return NextResponse.json(
        { error: messageError?.message || "Failed to create message" },
        { status: 400 }
      );
    }

    // Get sender info for notification
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single();

    const senderName =
      senderProfile?.full_name || senderProfile?.username || "Someone";

    // Create in-app notification for recipient
    await supabase.from("notifications").insert({
      user_id: recipientProfile.id,
      type: "new_message",
      title: `New message from ${senderName}`,
      body: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
      data: {
        conversation_id: conversationId,
        message_id: message.id,
        sender_id: user.id,
      },
    });

    // Send email notification with smart throttling:
    // Only send if 1+ hour since last message in this conversation (from anyone other than recipient)
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .neq("sender_id", recipientProfile.id)
      .neq("id", message.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastMessageTime = recentMessages?.[0]?.created_at
      ? new Date(recentMessages[0].created_at)
      : null;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const shouldSendEmail = !lastMessageTime || lastMessageTime < oneHourAgo;

    if (shouldSendEmail) {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const emailEnabled = await isEmailNotificationEnabled(
        supabaseAdmin, recipientProfile.id, "email_new_message"
      );

      if (emailEnabled) {
        const {
          data: { user: recipientUser },
        } = await supabaseAdmin.auth.admin.getUserById(recipientProfile.id);
        const recipientEmail = recipientUser?.email;

        if (recipientEmail) {
          const emailContent = newMessageEmail({
            recipientName:
              recipientProfile.full_name ||
              recipientProfile.username ||
              "there",
            senderName,
            messagePreview: content,
            conversationId,
            gigTitle: null,
          });

          sendEmail({
            to: recipientEmail,
            ...emailContent,
          }).catch((err) =>
            console.error("Failed to send message notification email:", err)
          );
        }
      }
    }

    // Dispatch webhook
    dispatchWebhookAsync(recipientProfile.id, "message.new", {
      message_id: message.id,
      conversation_id: conversationId,
      sender_id: user.id,
      content_preview: content.slice(0, 200),
    });

    return NextResponse.json(
      { data: { conversation_id: conversationId, message } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
