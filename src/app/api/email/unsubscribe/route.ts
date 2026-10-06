import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/auth/get-user";
import { UNSUBSCRIBABLE_SETTINGS, verifyUnsubscribeToken } from "@/lib/email-unsubscribe";

/**
 * GET/POST /api/email/unsubscribe?token=...
 *
 * One-click unsubscribe from a single notification email setting. The token
 * is HMAC-signed (src/lib/email-unsubscribe.ts) and names the user and the
 * setting, so no login is needed. POST is the RFC 8058 one-click request mail
 * clients send from the List-Unsubscribe-Post header; GET is the link in the
 * email footer. Both turn the setting off and answer with a plain page.
 */

function page(title: string, message: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${title} | ugig.net</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 520px; margin: 60px auto; padding: 20px;">
  <h1 style="font-size: 22px;">${title}</h1>
  <p>${message}</p>
  <p><a href="/dashboard/notifications" style="color: #667eea;">Manage all notification settings</a></p>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handle(request: NextRequest) {
  const parsed = verifyUnsubscribeToken(request.nextUrl.searchParams.get("token"));
  if (!parsed) {
    return page(
      "Link not valid",
      "This unsubscribe link is invalid or incomplete. You can change your email settings from your dashboard.",
      400
    );
  }

  const { userId, setting } = parsed;
  const svc = createServiceClient();
  const { error } = await svc
    .from("notification_settings")
    .upsert(
      { user_id: userId, [setting]: false, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[unsubscribe] failed to update setting:", { setting, error: error.message });
    return page(
      "Something went wrong",
      "We could not update your email settings. Please try again, or change them from your dashboard.",
      500
    );
  }

  return page(
    "You're unsubscribed",
    `You will no longer receive ${UNSUBSCRIBABLE_SETTINGS[setting]} from ugig.net. Other emails are not affected.`
  );
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
