import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@ugig.net";
const PRODUCTION_URL = "https://ugig.net";

/** Get the app base URL, never returning localhost for emails */
function getBaseUrl(): string {
  const appUrl = process.env.APP_URL;
  if (appUrl && !appUrl.includes("localhost")) return appUrl;
  const nextUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (nextUrl && !nextUrl.includes("localhost")) return nextUrl;
  return PRODUCTION_URL;
}

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  const resend = getResendClient();
  if (!resend) {
    console.log("RESEND_API_KEY not configured, skipping email:", { to, subject });
    return { success: true, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("Failed to send email:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}

// Email templates

export function videoCallInviteEmail(params: {
  participantName: string;
  initiatorName: string;
  callId: string;
  gigTitle?: string | null;
  scheduledAt?: string | null;
}) {
  const { participantName, initiatorName, callId, gigTitle, scheduledAt } = params;
  const baseUrl = getBaseUrl();
  const joinUrl = `${baseUrl}/dashboard/calls/${callId}`;

  const gigLine = gigTitle
    ? `<p style="color: #6b7280; font-size: 14px;">Regarding: <strong>${gigTitle}</strong></p>`
    : "";

  const gigLineText = gigTitle ? `Regarding: ${gigTitle}\n` : "";

  const scheduleLine = scheduledAt
    ? `<p style="color: #6b7280; font-size: 14px;">Scheduled for: <strong>${new Date(scheduledAt).toLocaleString()}</strong></p>`
    : "";

  const scheduleLineText = scheduledAt
    ? `Scheduled for: ${new Date(scheduledAt).toLocaleString()}\n`
    : "";

  const title = scheduledAt ? "Video Call Scheduled" : "Video Call Invitation";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${participantName},</p>

    <p><strong>${initiatorName}</strong> has invited you to a video call on ugig.net.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      ${gigLine}
      ${scheduleLine}
    </div>

    <a href="${joinUrl}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      Join Video Call
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Click the button above to join the call directly from your browser.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
${title}

Hi ${participantName},

${initiatorName} has invited you to a video call on ugig.net.
${gigLineText}${scheduleLineText}
Join the call: ${joinUrl}

Click the link above to join the call directly from your browser.

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${initiatorName} invited you to a video call`,
    html,
    text,
  };
}

export function newApplicationEmail(params: {
  posterName: string;
  applicantName: string;
  gigTitle: string;
  gigId: string;
  applicationId: string;
  coverLetterPreview: string;
}) {
  const { posterName, applicantName, gigTitle, gigId, coverLetterPreview } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Application</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Application Received</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${posterName},</p>

    <p><strong>${applicantName}</strong> has applied to your gig:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #667eea;">${gigTitle}</h3>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
        <strong>Cover letter preview:</strong><br>
        "${coverLetterPreview.slice(0, 200)}${coverLetterPreview.length > 200 ? "..." : ""}"
      </p>
    </div>

    <a href="${baseUrl}/gigs/${gigId}/applications" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Application
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      You can review all applications and respond to candidates from your dashboard.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
New Application Received

Hi ${posterName},

${applicantName} has applied to your gig: ${gigTitle}

Cover letter preview:
"${coverLetterPreview.slice(0, 200)}${coverLetterPreview.length > 200 ? "..." : ""}"

View the application: ${baseUrl}/gigs/${gigId}/applications

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `New application for "${gigTitle}"`,
    html,
    text,
  };
}

export function applicationStatusEmail(params: {
  applicantName: string;
  gigTitle: string;
  gigId: string;
  status: string;
  posterName: string;
}) {
  const { applicantName, gigTitle, gigId, status, posterName } = params;
  const baseUrl = getBaseUrl();

  const statusMessages: Record<string, { title: string; message: string; color: string }> = {
    reviewing: {
      title: "Application Under Review",
      message: "Your application is being reviewed by the client.",
      color: "#3b82f6",
    },
    shortlisted: {
      title: "You've Been Shortlisted!",
      message: "Great news! You've been shortlisted for this gig.",
      color: "#10b981",
    },
    accepted: {
      title: "Application Accepted!",
      message: "Congratulations! Your application has been accepted.",
      color: "#10b981",
    },
    rejected: {
      title: "Application Update",
      message: "The client has decided to move forward with other candidates.",
      color: "#6b7280",
    },
  };

  const statusInfo = statusMessages[status] || {
    title: "Application Status Update",
    message: `Your application status has been updated to: ${status}`,
    color: "#667eea",
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${statusInfo.title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: ${statusInfo.color}; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${statusInfo.title}</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${applicantName},</p>

    <p>${statusInfo.message}</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: ${statusInfo.color};">${gigTitle}</h3>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
        Posted by ${posterName}
      </p>
    </div>

    <a href="${baseUrl}/dashboard/applications" style="display: inline-block; background: ${statusInfo.color}; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Your Applications
    </a>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
  </div>
</body>
</html>
`;

  const text = `
${statusInfo.title}

Hi ${applicantName},

${statusInfo.message}

Gig: ${gigTitle}
Posted by: ${posterName}

View your applications: ${baseUrl}/dashboard/applications

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${statusInfo.title} - ${gigTitle}`,
    html,
    text,
  };
}

export function newGigCommentEmail(params: {
  posterName: string;
  commenterName: string;
  gigTitle: string;
  gigId: string;
  commentPreview: string;
}) {
  const { posterName, commenterName, gigTitle, gigId, commentPreview } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Question on Your Gig</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Question on Your Gig</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${posterName},</p>

    <p><strong>${commenterName}</strong> asked a question on your gig:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #667eea;">${gigTitle}</h3>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
        "${commentPreview.slice(0, 200)}${commentPreview.length > 200 ? "..." : ""}"
      </p>
    </div>

    <a href="${baseUrl}/gigs/${gigId}#comments" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View &amp; Reply
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Responding to questions helps candidates learn more about your gig.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
  </div>
</body>
</html>
`;

  const text = `
New Question on Your Gig

Hi ${posterName},

${commenterName} asked a question on your gig: ${gigTitle}

"${commentPreview.slice(0, 200)}${commentPreview.length > 200 ? "..." : ""}"

View & reply: ${baseUrl}/gigs/${gigId}#comments

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `New question on "${gigTitle}"`,
    html,
    text,
  };
}

export function newGigCommentReplyEmail(params: {
  recipientName: string;
  replierName: string;
  gigTitle: string;
  gigId: string;
  replyPreview: string;
}) {
  const { recipientName, replierName, gigTitle, gigId, replyPreview } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Reply to Your Comment</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Reply to Your Comment</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${recipientName},</p>

    <p><strong>${replierName}</strong> replied to your comment on:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #667eea;">${gigTitle}</h3>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
        "${replyPreview.slice(0, 200)}${replyPreview.length > 200 ? "..." : ""}"
      </p>
    </div>

    <a href="${baseUrl}/gigs/${gigId}#comments" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Conversation
    </a>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
  </div>
</body>
</html>
`;

  const text = `
New Reply to Your Comment

Hi ${recipientName},

${replierName} replied to your comment on: ${gigTitle}

"${replyPreview.slice(0, 200)}${replyPreview.length > 200 ? "..." : ""}"

View conversation: ${baseUrl}/gigs/${gigId}#comments

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${replierName} replied to your comment on "${gigTitle}"`,
    html,
    text,
  };
}

export function newFollowerEmail(params: {
  recipientName: string;
  followerName: string;
  followerUsername: string;
}) {
  const { recipientName, followerName, followerUsername } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Follower</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Follower</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${recipientName},</p>

    <p><strong>${followerName}</strong> (@${followerUsername}) started following you on ugig.net!</p>

    <a href="${baseUrl}/u/${followerUsername}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Their Profile
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Check out their profile to see if you'd like to follow them back.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
New Follower

Hi ${recipientName},

${followerName} (@${followerUsername}) started following you on ugig.net!

View their profile: ${baseUrl}/u/${followerUsername}

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${followerName} started following you on ugig.net`,
    html,
    text,
  };
}

export function endorsementReceivedEmail(params: {
  endorsedName: string;
  endorserName: string;
  skill: string;
  comment?: string;
  endorsedUsername: string;
}) {
  const { endorsedName, endorserName, skill, comment, endorsedUsername } = params;
  const baseUrl = getBaseUrl();

  const commentBlock = comment
    ? `<p style="color: #6b7280; font-size: 14px; font-style: italic; margin-top: 10px;">"${comment}"</p>`
    : "";

  const commentText = comment ? `\nComment: "${comment}"` : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Skill Endorsement</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Skill Endorsement</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${endorsedName},</p>

    <p><strong>${endorserName}</strong> endorsed your <strong>${skill}</strong> skill!</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">👍</span>
        <div>
          <h3 style="margin: 0; color: #10b981;">${skill}</h3>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Endorsed by ${endorserName}</p>
        </div>
      </div>
      ${commentBlock}
    </div>

    <a href="${baseUrl}/u/${endorsedUsername}" style="display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Your Profile
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Endorsements help build trust and showcase your skills to potential clients.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
New Skill Endorsement

Hi ${endorsedName},

${endorserName} endorsed your ${skill} skill!${commentText}

View your profile: ${baseUrl}/u/${endorsedUsername}

Endorsements help build trust and showcase your skills to potential clients.

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${endorserName} endorsed your "${skill}" skill`,
    html,
    text,
  };
}
export function newMessageEmail(params: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  conversationId: string;
  gigTitle: string | null;
}) {
  const { recipientName, senderName, messagePreview, conversationId, gigTitle } = params;
  const baseUrl = getBaseUrl();

  const contextLine = gigTitle
    ? `<p style="color: #6b7280; font-size: 14px;">Regarding: <strong>${gigTitle}</strong></p>`
    : "";

  const contextLineText = gigTitle ? `Regarding: ${gigTitle}\n` : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Message</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Message from ${senderName}</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${recipientName},</p>

    <p><strong>${senderName}</strong> sent you a message:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      ${contextLine}
      <p style="color: #374151; margin-bottom: 0;">
        "${messagePreview.slice(0, 200)}${messagePreview.length > 200 ? "..." : ""}"
      </p>
    </div>

    <a href="${baseUrl}/dashboard/messages/${conversationId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      Reply to Message
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      You received this email because you have been away for a while. Active users receive in-app notifications instead.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
  </div>
</body>
</html>
`;

  const text = `
New Message from ${senderName}

Hi ${recipientName},

${senderName} sent you a message:
${contextLineText}
"${messagePreview.slice(0, 200)}${messagePreview.length > 200 ? "..." : ""}"

Reply: ${baseUrl}/dashboard/messages/${conversationId}

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `New message from ${senderName}`,
    html,
    text,
  };
}

export function welcomeEmail(params: { name: string }) {
  const { name } = params;
  const baseUrl = getBaseUrl();
  const displayName = name || "there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ugig.net!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ugig.net! 🎉</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${displayName},</p>

    <p>Welcome aboard! You've just joined the AI-powered gig marketplace where talent meets opportunity.</p>

    <p>To get discovered by clients and start landing gigs, complete your profile:</p>

    <ul style="color: #374151; padding-left: 20px;">
      <li>Add your skills and AI tools</li>
      <li>Write a compelling bio</li>
      <li>Set your availability and rate</li>
      <li>Upload a portfolio or resume</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${baseUrl}/profile/edit" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Complete Your Profile
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      A complete profile makes you visible to clients browsing candidates. The more detail you add, the better your chances of getting hired!
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}" style="color: #9ca3af;">Browse gigs</a> · <a href="${baseUrl}/candidates" style="color: #9ca3af;">See candidates</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
Welcome to ugig.net! 🎉

Hi ${displayName},

Welcome aboard! You've just joined the AI-powered gig marketplace where talent meets opportunity.

To get discovered by clients and start landing gigs, complete your profile:
- Add your skills and AI tools
- Write a compelling bio
- Set your availability and rate
- Upload a portfolio or resume

Complete your profile: ${baseUrl}/profile/edit

A complete profile makes you visible to clients browsing candidates. The more detail you add, the better your chances of getting hired!

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: "Welcome to ugig.net! Complete your profile to get discovered",
    html,
    text,
  };
}

export function profileReminderEmail(params: { name: string; daysAgo: number }) {
  const { name, daysAgo } = params;
  const baseUrl = getBaseUrl();
  const displayName = name || "there";
  const daysText = daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Profile</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Don't Miss Out! 👋</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${displayName},</p>

    <p>You signed up ${daysText} but haven't completed your profile yet.</p>

    <p>Right now, clients are browsing candidates on ugig.net — but they can't find you without a complete profile!</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0; color: #374151; font-weight: 500;">It only takes a few minutes:</p>
      <ul style="color: #6b7280; padding-left: 20px; margin-bottom: 0;">
        <li>Add your skills and expertise</li>
        <li>Write a short bio about yourself</li>
        <li>Set your rate and availability</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${baseUrl}/profile/edit" style="display: inline-block; background: #f59e0b; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Complete Your Profile
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      Complete it to get discovered by clients looking for talent like you!
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
Don't Miss Out! 👋

Hi ${displayName},

You signed up ${daysText} but haven't completed your profile yet.

Right now, clients are browsing candidates on ugig.net — but they can't find you without a complete profile!

It only takes a few minutes:
- Add your skills and expertise
- Write a short bio about yourself
- Set your rate and availability

Complete your profile: ${baseUrl}/profile/edit

Complete it to get discovered by clients looking for talent like you!

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: "Your ugig.net profile is incomplete — finish it to get discovered!",
    html,
    text,
  };
}

export function newPostCommentEmail(params: {
  recipientName: string;
  commenterName: string;
  postContentPreview: string;
  commentPreview: string;
  postId: string;
}) {
  const { recipientName, commenterName, postContentPreview, commentPreview, postId } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Comment on Your Post</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Comment on Your Post</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${recipientName},</p>

    <p><strong>${commenterName}</strong> commented on your post:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #6b7280; font-size: 14px; margin-top: 0;">Your post:</p>
      <p style="color: #374151; font-style: italic;">"${postContentPreview.slice(0, 100)}${postContentPreview.length > 100 ? "..." : ""}"</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 5px;">Their comment:</p>
      <p style="color: #374151; margin-bottom: 0;">"${commentPreview.slice(0, 200)}${commentPreview.length > 200 ? "..." : ""}"</p>
    </div>

    <a href="${baseUrl}/post/${postId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Post
    </a>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
New Comment on Your Post

Hi ${recipientName},

${commenterName} commented on your post:

Your post: "${postContentPreview.slice(0, 100)}${postContentPreview.length > 100 ? "..." : ""}"

Their comment: "${commentPreview.slice(0, 200)}${commentPreview.length > 200 ? "..." : ""}"

View post: ${baseUrl}/post/${postId}

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${commenterName} commented on your post`,
    html,
    text,
  };
}

export function upvoteMilestoneEmail(params: {
  authorName: string;
  postContentPreview: string;
  postId: string;
  milestone: number;
}) {
  const { authorName, postContentPreview, postId, milestone } = params;
  const baseUrl = getBaseUrl();

  const milestoneEmoji = milestone >= 100 ? "🔥" : milestone >= 25 ? "🎉" : "👍";
  const milestoneMessage =
    milestone >= 100
      ? "Your post is on fire!"
      : milestone >= 25
        ? "Your post is gaining traction!"
        : "People are loving your post!";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your post hit ${milestone} upvotes!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <img src="${baseUrl}/icons/icon-192x192.png" alt="ugig.net" style="height: 40px; margin-bottom: 15px;">
    <div style="font-size: 48px; margin-bottom: 10px;">${milestoneEmoji}</div>
    <h1 style="color: white; margin: 0; font-size: 24px;">${milestone} Upvotes!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${authorName},</p>

    <p><strong>${milestoneMessage}</strong> Your post just hit ${milestone} upvotes.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #374151; margin: 0; font-style: italic;">
        "${postContentPreview.slice(0, 150)}${postContentPreview.length > 150 ? "..." : ""}"
      </p>
    </div>

    <a href="${baseUrl}/post/${postId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Your Post
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Keep posting great content — your audience is growing!
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
${milestoneEmoji} ${milestone} Upvotes!

Hi ${authorName},

${milestoneMessage} Your post just hit ${milestone} upvotes.

"${postContentPreview.slice(0, 150)}${postContentPreview.length > 150 ? "..." : ""}"

View your post: ${baseUrl}/post/${postId}

Keep posting great content — your audience is growing!

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `🎉 Your post hit ${milestone} upvotes!`,
    html,
    text,
  };
}

export function newPostCommentReplyEmail(params: {
  recipientName: string;
  replierName: string;
  originalCommentPreview: string;
  replyPreview: string;
  postId: string;
}) {
  const { recipientName, replierName, originalCommentPreview, replyPreview, postId } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Reply to Your Comment</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Reply to Your Comment</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${recipientName},</p>

    <p><strong>${replierName}</strong> replied to your comment:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #6b7280; font-size: 14px; margin-top: 0;">Your comment:</p>
      <p style="color: #374151; font-style: italic;">"${originalCommentPreview.slice(0, 100)}${originalCommentPreview.length > 100 ? "..." : ""}"</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 5px;">Their reply:</p>
      <p style="color: #374151; margin-bottom: 0;">"${replyPreview.slice(0, 200)}${replyPreview.length > 200 ? "..." : ""}"</p>
    </div>

    <a href="${baseUrl}/post/${postId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Conversation
    </a>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
New Reply to Your Comment

Hi ${recipientName},

${replierName} replied to your comment:

Your comment: "${originalCommentPreview.slice(0, 100)}${originalCommentPreview.length > 100 ? "..." : ""}"

Their reply: "${replyPreview.slice(0, 200)}${replyPreview.length > 200 ? "..." : ""}"

View conversation: ${baseUrl}/post/${postId}

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `${replierName} replied to your comment`,
    html,
    text,
  };
}

export function reviewReceivedEmail(params: {
  recipientName: string;
  reviewerName: string;
  gigTitle: string;
  gigId: string;
  rating: number;
  comment?: string;
}) {
  const { recipientName, reviewerName, gigTitle, gigId, rating, comment } = params;
  const baseUrl = getBaseUrl();

  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  const ratingEmoji = rating >= 4 ? "🌟" : rating >= 3 ? "⭐" : "📝";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Review Received</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <img src="${baseUrl}/icons/icon-192x192.png" alt="ugig.net" style="height: 40px; margin-bottom: 15px;">
    <div style="font-size: 48px; margin-bottom: 10px;">${ratingEmoji}</div>
    <h1 style="color: white; margin: 0; font-size: 24px;">New Review Received</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${recipientName},</p>

    <p><strong>${reviewerName}</strong> left you a review for <strong>${gigTitle}</strong>:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 28px; color: #667eea; letter-spacing: 4px;">${stars}</div>
      <p style="color: #374151; font-weight: 600; margin: 10px 0 0 0;">${rating} out of 5 stars</p>
      ${comment ? `<p style="color: #6b7280; font-style: italic; margin: 15px 0 0 0;">"${comment.slice(0, 300)}${comment.length > 300 ? "..." : ""}"</p>` : ""}
    </div>

    <a href="${baseUrl}/gig/${gigId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Gig
    </a>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      Reviews help build your reputation on ugig.net. Keep up the great work!
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
${ratingEmoji} New Review Received

Hi ${recipientName},

${reviewerName} left you a review for ${gigTitle}:

${stars} (${rating}/5 stars)
${comment ? `"${comment.slice(0, 300)}${comment.length > 300 ? "..." : ""}"` : ""}

View gig: ${baseUrl}/gig/${gigId}

Reviews help build your reputation on ugig.net. Keep up the great work!

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `⭐ ${reviewerName} left you a ${rating}-star review`,
    html,
    text,
  };
}

export function gigFilledEmail(params: {
  posterName: string;
  gigTitle: string;
  gigId: string;
  hiredCount: number;
}) {
  const { posterName, gigTitle, gigId, hiredCount } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Gig Has Been Filled!</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <img src="${baseUrl}/icons/icon-192x192.png" alt="ugig.net" style="height: 40px; margin-bottom: 15px;">
    <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
    <h1 style="color: white; margin: 0; font-size: 24px;">Gig Filled!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${posterName},</p>

    <p>Great news! Your gig <strong>"${gigTitle}"</strong> has been marked as filled.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #374151; margin: 0;">
        <strong>${hiredCount}</strong> talented ${hiredCount === 1 ? "professional has" : "professionals have"} been hired for this project.
      </p>
    </div>

    <p>Next steps:</p>
    <ul style="color: #374151;">
      <li>Connect with your hired talent through messages</li>
      <li>Set clear expectations and milestones</li>
      <li>Leave reviews when the work is complete</li>
    </ul>

    <a href="${baseUrl}/gig/${gigId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 10px;">
      View Your Gig
    </a>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
🎉 Gig Filled!

Hi ${posterName},

Great news! Your gig "${gigTitle}" has been marked as filled.

${hiredCount} talented ${hiredCount === 1 ? "professional has" : "professionals have"} been hired for this project.

Next steps:
- Connect with your hired talent through messages
- Set clear expectations and milestones
- Leave reviews when the work is complete

View your gig: ${baseUrl}/gig/${gigId}

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `🎉 Your gig "${gigTitle}" has been filled!`,
    html,
    text,
  };
}

export function gigExpiredEmail(params: {
  posterName: string;
  gigTitle: string;
  gigId: string;
  applicantCount: number;
}) {
  const { posterName, gigTitle, gigId, applicantCount } = params;
  const baseUrl = getBaseUrl();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Gig Has Expired</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <img src="${baseUrl}/icons/icon-192x192.png" alt="ugig.net" style="height: 40px; margin-bottom: 15px;">
    <div style="font-size: 48px; margin-bottom: 10px;">⏰</div>
    <h1 style="color: white; margin: 0; font-size: 24px;">Gig Expired</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hi ${posterName},</p>

    <p>Your gig <strong>"${gigTitle}"</strong> has reached its expiration date and is no longer accepting applications.</p>

    ${applicantCount > 0 ? `
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #374151; margin: 0;">
        You received <strong>${applicantCount}</strong> ${applicantCount === 1 ? "application" : "applications"} for this gig.
        ${applicantCount > 0 ? "Don't forget to review them!" : ""}
      </p>
    </div>
    ` : `
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #374151; margin: 0;">
        This gig didn't receive any applications. Consider reposting with updated details or a more competitive budget.
      </p>
    </div>
    `}

    <p>What would you like to do?</p>

    <div style="margin-top: 20px;">
      <a href="${baseUrl}/gig/${gigId}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-right: 10px;">
        View Gig
      </a>
      <a href="${baseUrl}/dashboard/gigs/new" style="display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
        Post New Gig
      </a>
    </div>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">ugig.net - AI-Powered Gig Marketplace</p>
    <p style="margin: 5px 0 0 0;">
      <a href="${baseUrl}/dashboard/notifications" style="color: #9ca3af;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>
`;

  const text = `
⏰ Gig Expired

Hi ${posterName},

Your gig "${gigTitle}" has reached its expiration date and is no longer accepting applications.

${applicantCount > 0 ? `You received ${applicantCount} ${applicantCount === 1 ? "application" : "applications"} for this gig. Don't forget to review them!` : "This gig didn't receive any applications. Consider reposting with updated details or a more competitive budget."}

View gig: ${baseUrl}/gig/${gigId}
Post new gig: ${baseUrl}/dashboard/gigs/new

---
ugig.net - AI-Powered Gig Marketplace
`;

  return {
    subject: `⏰ Your gig "${gigTitle}" has expired`,
    html,
    text,
  };
}
