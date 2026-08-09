import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { sendEmail, newMessageEmail } from "@/lib/email";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import {
  ADMIN_ONLY_AUDIENCES,
  APPLICATION_STATUSES,
  BROADCAST_AUDIENCES,
  MAX_BROADCAST_RECIPIENTS,
  chunk,
  emailOptOutIds,
  resolveAudience,
  type BroadcastAudience,
} from "@/lib/broadcast/audiences";

export const runtime = "nodejs";

const bodySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content is required")
    .max(2000, "Message must be at most 2000 characters"),
  audience: z.enum(BROADCAST_AUDIENCES),
  // Only applied to audiences that include gig applicants.
  statuses: z.array(z.enum(APPLICATION_STATUSES)).optional(),
});

async function isAdmin(
  svc: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<boolean> {
  const { data } = await svc.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

function forbiddenAudience(audience: BroadcastAudience, admin: boolean): boolean {
  return ADMIN_ONLY_AUDIENCES.includes(audience) && !admin;
}

function hasSameParticipants(existing: string[] | null, current: string[]): boolean {
  if (!existing || existing.length !== current.length) return false;
  const existingIds = new Set(existing);
  return current.every((id) => existingIds.has(id));
}

// GET /api/messages/broadcast
// Recipient counts per audience, so the composer can show "will reach N people"
// before anything is sent. Admin-only audiences are omitted for non-admins.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user } = auth;
    const svc = createServiceClient();
    const admin = await isAdmin(svc, user.id);

    const visible = BROADCAST_AUDIENCES.filter((audience) => !forbiddenAudience(audience, admin));

    const counts: Record<string, number> = {};
    await Promise.all(
      visible.map(async (audience) => {
        const { totalMatched } = await resolveAudience(svc, {
          audience,
          senderId: user.id,
          cap: false,
        });
        counts[audience] = totalMatched;
      })
    );

    return NextResponse.json({
      is_admin: admin,
      audiences: visible,
      counts,
      max_recipients: MAX_BROADCAST_RECIPIENTS,
    });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

// POST /api/messages/broadcast
// Sends one message to a whole audience spanning gigs and bounties (or, for
// admins, every user). Mirrors the per-gig message-all route: a single group
// conversation reused across sends, one message row, then in-app + email +
// webhook fan-out.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user } = auth;

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { content, audience, statuses } = parsed.data;

    const svc = createServiceClient();
    const admin = await isAdmin(svc, user.id);

    if (forbiddenAudience(audience, admin)) {
      return NextResponse.json({ error: "That audience is admin only" }, { status: 403 });
    }

    const { recipientIds, totalMatched, truncated } = await resolveAudience(svc, {
      audience,
      senderId: user.id,
      statuses,
    });

    if (recipientIds.length === 0) {
      return NextResponse.json({ error: "No recipients match that audience" }, { status: 400 });
    }

    const participantIds = [user.id, ...recipientIds].sort();

    // Reuse a thread only when both the audience key and exact roster match.
    // Changing participant_ids on an older thread would grant the new roster
    // access to its entire message history.
    const { data: existingThreads } = await svc
      .from("conversations")
      .select("id, participant_ids")
      .eq("broadcast_owner_id", user.id)
      .eq("broadcast_audience", audience)
      .eq("is_broadcast", true);

    const existing = (existingThreads ?? []).find((thread) =>
      hasSameParticipants(thread.participant_ids, participantIds)
    );

    let conversationId: string;
    if (existing?.id) {
      conversationId = existing.id;
      await svc.from("conversations").update({ archived_at: null }).eq("id", conversationId);
    } else {
      const { data: created, error: convError } = await svc
        .from("conversations")
        .insert({
          participant_ids: participantIds,
          is_broadcast: true,
          broadcast_owner_id: user.id,
          broadcast_audience: audience,
        })
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

    const { data: senderProfile } = await svc
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single();
    const senderName = senderProfile?.full_name || senderProfile?.username || "Someone";

    const preview = content.slice(0, 100) + (content.length > 100 ? "..." : "");

    // In-app notifications, chunked so one broadcast isn't a single huge insert.
    for (const batch of chunk(recipientIds, 500)) {
      await svc.from("notifications").insert(
        batch.map((recipientId) => ({
          user_id: recipientId,
          type: "new_message" as const,
          title: `New message from ${senderName}`,
          body: preview,
          data: {
            conversation_id: conversationId,
            message_id: message.id,
            sender_id: user.id,
            broadcast_audience: audience,
          },
        }))
      );
    }

    // Webhooks are already fire-and-forget.
    for (const recipientId of recipientIds) {
      dispatchWebhookAsync(recipientId, "message.new", {
        message_id: message.id,
        conversation_id: conversationId,
        sender_id: user.id,
        content_preview: content.slice(0, 200),
      });
    }

    // Email fan-out. Everything the per-gig route looked up per recipient is
    // batched here — at broadcast sizes the N+1 version is the entire latency
    // budget. Still honours each user's email_new_message preference.
    const emailed = await sendBroadcastEmails({
      svc,
      recipientIds,
      senderName,
      content,
      conversationId,
    });

    return NextResponse.json({
      conversation_id: conversationId,
      recipients: recipientIds.length,
      emailed,
      total_matched: totalMatched,
      truncated,
      ...(truncated
        ? {
            warning: `Audience had ${totalMatched} people; messaged the first ${recipientIds.length}.`,
          }
        : {}),
    });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

async function sendBroadcastEmails({
  svc,
  recipientIds,
  senderName,
  content,
  conversationId,
}: {
  svc: ReturnType<typeof createServiceClient>;
  recipientIds: string[];
  senderName: string;
  content: string;
  conversationId: string;
}): Promise<number> {
  const optedOut = await emailOptOutIds(svc, recipientIds, "email_new_message");
  const targets = recipientIds.filter((id) => !optedOut.has(id));
  if (targets.length === 0) return 0;

  // Names, in bulk.
  const names = new Map<string, string>();
  for (const batch of chunk(targets, 500)) {
    const { data } = await svc.from("profiles").select("id, full_name, username").in("id", batch);
    for (const row of (data ?? []) as {
      id: string;
      full_name: string | null;
      username: string | null;
    }[]) {
      names.set(row.id, row.full_name || row.username || "there");
    }
  }

  // Emails live in auth.users; page the admin list once instead of one
  // getUserById per recipient.
  const emails = new Map<string, string>();
  const wanted = new Set(targets);
  const PAGE = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({
      page,
      perPage: PAGE,
    });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email && wanted.has(u.id)) emails.set(u.id, u.email);
    }
    if (data.users.length < PAGE) break;
  }

  let sent = 0;
  for (const recipientId of targets) {
    const to = emails.get(recipientId);
    if (!to) continue;

    const emailContent = newMessageEmail({
      recipientName: names.get(recipientId) || "there",
      senderName,
      messagePreview: content,
      conversationId,
      gigTitle: null,
    });

    sendEmail({ to, ...emailContent }).catch((err) =>
      console.error("Failed to send broadcast message email:", err)
    );
    sent++;
  }

  return sent;
}
