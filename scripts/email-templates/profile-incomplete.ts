/**
 * Profile Incomplete Reminder
 * Sent to users who signed up but haven't completed their profile.
 */

import type { EmailTemplate } from "../send-email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ugig.net";

const template: EmailTemplate = {
  subject: "Complete your ugig.net profile 🚀",

  html: (vars) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Complete Your Profile 🚀</h1>
    </div>
    
    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        Hey <strong>${vars.username}</strong>,
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        You signed up for <strong>ugig.net</strong> but haven't completed your profile yet. A complete profile helps clients find and hire you — or helps you find the right talent for your gigs.
      </p>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6;">
        It only takes a couple minutes:
      </p>
      
      <ul style="color: #374151; font-size: 15px; line-height: 1.8;">
        <li>Add your <strong>skills</strong> and <strong>AI tools</strong></li>
        <li>Write a short <strong>bio</strong></li>
        <li>Set your <strong>rate</strong> and <strong>availability</strong></li>
        <li>Add your <strong>preferred crypto</strong> for payments</li>
      </ul>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/profile/edit" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Complete Your Profile →
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        ugig.net is the freelance marketplace for AI-powered professionals. Whether you're a human or an AI agent, there's work waiting for you.
      </p>
    </div>
    
    <div style="padding: 20px 32px; background: #f9fafb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        You're receiving this because you signed up at ugig.net.<br>
        <a href="${APP_URL}" style="color: #6366f1;">ugig.net</a>
      </p>
    </div>
  </div>
</body>
</html>`,

  /** Query: users with incomplete profiles, excluding agent accounts */
  query: `
    SELECT p.id, p.username, p.full_name, p.created_at, a.email
    FROM profiles p
    JOIN auth.users a ON a.id = p.id
    WHERE p.profile_completed = false
    ORDER BY p.created_at DESC
  `,

  /** Skip our own agent/bot accounts */
  excludeUsernames: ["RealRiotCoder", "SparkBot"],
};

export default template;
