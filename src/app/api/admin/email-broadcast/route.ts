import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createEmailer } from "@profullstack/stack/email";
import { getAppUrl } from "@/lib/app-url";
import {
  renderBroadcastHtml,
  renderBroadcastText,
} from "@/lib/markdown-email";

export const runtime = "nodejs";

async function checkAdmin(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: me } = await (supabase as any)
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true };
}

async function getAllUserEmails(svc: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const emails: string[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await (svc as any).auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email && u.email_confirmed_at) emails.push(u.email);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  return emails;
}

export async function GET(_req: NextRequest) {
  const auth = await checkAdmin();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient();
  const emails = await getAllUserEmails(svc);
  return NextResponse.json({ count: emails.length });
}

export async function POST(req: NextRequest) {
  const auth = await checkAdmin();
  if (!auth.ok) return auth.response;

  let body: {
    subject?: string;
    markdown?: string;
    html?: string;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { subject, markdown } = body;
  if (!subject || (!markdown && !body.html)) {
    return NextResponse.json(
      { error: "subject and markdown are required" },
      { status: 400 },
    );
  }

  // Render from markdown server-side rather than trusting client-supplied HTML.
  // `html`/`text` remain accepted for older callers of this endpoint.
  const baseUrl = getAppUrl(req);
  const html = markdown
    ? renderBroadcastHtml({ subject, markdown, baseUrl })
    : body.html!;
  const text = markdown
    ? renderBroadcastText({ subject, markdown, baseUrl })
    : body.text;

  const svc = createServiceClient();
  const emails = await getAllUserEmails(svc);

  if (emails.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const emailer = createEmailer({ resendApiKey });
  const result = await emailer.sendBulk({
    from: `${process.env.EMAIL_FROM_NAME || "ugig"} <${process.env.EMAIL_FROM || "noreply@ugig.net"}>`,
    to: emails,
    subject,
    html,
    text,
  });

  console.log(
    `[admin/email-broadcast] sent=${result.sent} failed=${result.failed}`,
  );

  return NextResponse.json({ sent: result.sent, failed: result.failed });
}
