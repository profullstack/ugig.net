import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "notifications@ugig.net";

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

export function newApplicationEmail(params: {
  posterName: string;
  applicantName: string;
  gigTitle: string;
  gigId: string;
  applicationId: string;
  coverLetterPreview: string;
}) {
  const { posterName, applicantName, gigTitle, gigId, coverLetterPreview } = params;
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
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
  const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";
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
