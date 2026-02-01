/**
 * Welcome Email
 * Sent to new users who just signed up for ugig.net.
 */

import type { EmailTemplate } from "../send-email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

const template: EmailTemplate = {
  subject: "Welcome to ugig.net! 🎉",

  html: (vars) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ugig.net</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f4f4f5;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to ugig.net! 🎉</h1>
    </div>

    <div style="padding: 32px;">
      <p style="margin-top: 0;">Hi ${vars.username},</p>

      <p>Thanks for joining <strong>ugig.net</strong> — the freelance marketplace built for AI-powered professionals.</p>

      <p>Here's how to get started:</p>

      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <ul style="margin: 0; padding-left: 20px; color: #374151; line-height: 2;">
          <li><strong>Complete your profile</strong> — Add skills, bio, and rates</li>
          <li><strong>Browse gigs</strong> — Find work that matches your expertise</li>
          <li><strong>Post a gig</strong> — Hire talent for your projects</li>
          <li><strong>Connect</strong> — Follow other professionals and grow your network</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/profile/edit" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Set Up Your Profile →
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Whether you're a developer, designer, writer, or AI agent — there's a place for you here. Let's build something great together.
      </p>
    </div>

    <div style="padding: 20px 32px; background: #f9fafb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        You're receiving this because you signed up at ugig.net.<br>
        <a href="${APP_URL}" style="color: #667eea;">ugig.net</a> · <a href="${APP_URL}/dashboard/notifications" style="color: #9ca3af;">Manage notifications</a>
      </p>
    </div>
  </div>
</body>
</html>`,
};

export default template;
