import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { sendEmail, newMessageEmail } from "@/lib/email";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { isEmailNotificationEnabled } from "@/lib/notification-settings";
import { z } from "zod";

const bodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content is required")
    .max(2000, "Message must be at most 2000 characters"),
  // Optional status filter; when omitted, every applicant is messaged.
  statuses: z
    .array(
      z.enum([
        "pending",
        "reviewing",
        "shortlisted",
        "accepted",
        "rejected",
        "withdrawn",
      ])
    )
    .optional(),
});

// POST /api/gigs/[id]/applications/message-all
// Sends a single broadcast message to every applicant of a gig. Reuses one
// group conversation (poster + all applicants) so the poster gets one inbox
// thread instead of one per applicant. Notifies each recipient in-app, by
// email, and via webhook.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gigId } = await params;
    const auth = await getAuthContext(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { user } = auth;

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const { content, statuses } = parsed.data;

    const svc = createServiceClient();

    // Verify the caller is the gig poster
    const { data: gig } = await svc
      .from("gigs")
      .select("id, title, poster_id")
      .eq("id", gigId)
      .single();

    if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    if (gig.poster_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Collect the distinct applicants to message
    let appsQuery = svc
      .from("applications")
      .select("applicant_id")
      .eq("gig_id", gigId);
    if (statuses && statuses.length > 0) {
      appsQuery = appsQuery.in("status", statuses);
    }
    const { data: applications, error: appsError } = await appsQuery;
    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 400 });
    }

    const applicantIds = Array.from(
      new Set(
        (applications ?? [])
          .map((a) => a.applicant_id as string)
          .filter((id): id is string => !!id && id !== user.id)
      )
    );

    if (applicantIds.length === 0) {
      return NextResponse.json(
        { error: "No applicants to message" },
        { status: 400 }
      );
    }

    const participantIds = [user.id, ...applicantIds].sort();

    // Find an existing gig-scoped broadcast conversation with exactly this set
    // of participants; reuse it so repeated broadcasts stay in one thread.
    const { data: candidates } = await svc
      .from("conversations")
      .select("id, participant_ids")
      .eq("gig_id", gigId)
      .contains("participant_ids", participantIds);

    const existing = (candidates ?? []).find(
      (c) =>
        Array.isArray(c.participant_ids) &&
        c.participant_ids.length === participantIds.length
    );

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
    } else {
      const { data: created, error: convError } = await svc
        .from("conversations")
        .insert({ participant_ids: participantIds, gig_id: gigId })
        .select("id")
        .single();

      if (convError || !created) {
        return NextResponse.json(
          { error: convError?.message || "Failed to create conversation" },
          { status: 400 }
        );
      }
      conversationId = created.id;
    }

    // Insert the broadcast message (poster has read their own message)
    const { data: message, error: messageError } = await svc
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        read_by: [user.id],
      })
      .select("id")
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        { error: messageError?.message || "Failed to send message" },
        { status: 400 }
      );
    }

    await svc
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Sender display name for notifications/emails
    const { data: senderProfile } = await svc
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single();
    const senderName =
      senderProfile?.full_name || senderProfile?.username || "Someone";

    const preview = content.slice(0, 100) + (content.length > 100 ? "..." : "");

    // In-app notifications (bulk insert)
    await svc.from("notifications").insert(
      applicantIds.map((recipientId) => ({
        user_id: recipientId,
        type: "new_message" as const,
        title: `New message from ${senderName}`,
        body: preview,
        data: {
          conversation_id: conversationId,
          message_id: message.id,
          sender_id: user.id,
        },
      }))
    );

    // Email + webhook per recipient. This is a deliberate broadcast, so we send
    // email regardless of conversation throttling but still honor the user's
    // email_new_message preference.
    for (const recipientId of applicantIds) {
      dispatchWebhookAsync(recipientId, "message.new", {
        message_id: message.id,
        conversation_id: conversationId,
        sender_id: user.id,
        content_preview: content.slice(0, 200),
      });

      const emailEnabled = await isEmailNotificationEnabled(
        svc,
        recipientId,
        "email_new_message"
      );
      if (!emailEnabled) continue;

      const { data: recipientProfile } = await svc
        .from("profiles")
        .select("full_name, username")
        .eq("id", recipientId)
        .single();

      const {
        data: { user: recipientUser },
      } = await svc.auth.admin.getUserById(recipientId);
      const recipientEmail = recipientUser?.email;
      if (!recipientEmail) continue;

      const emailContent = newMessageEmail({
        recipientName:
          recipientProfile?.full_name || recipientProfile?.username || "there",
        senderName,
        messagePreview: content,
        conversationId,
        gigTitle: gig.title,
      });

      sendEmail({ to: recipientEmail, ...emailContent }).catch((err) =>
        console.error("Failed to send broadcast message email:", err)
      );
    }

    return NextResponse.json({
      conversation_id: conversationId,
      recipients: applicantIds.length,
    });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
