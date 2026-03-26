import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printDetail, printSuccess, type OutputOptions } from "../output.js";

export function registerNotificationSettingsCommands(program: Command): void {
  const notifSettings = program
    .command("notification-settings")
    .description("Manage notification preferences");

  // ── View settings ──────────────────────────────────────────────

  notifSettings
    .command("view")
    .description("View your notification settings")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching notification settings...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          data: Record<string, unknown>;
        }>("/api/notification-settings");
        spinner?.stop();
        printDetail(
          [
            { label: "New Message", key: "email_new_message", transform: (v) => v ? "✓" : "✗" },
            { label: "New Comment", key: "email_new_comment", transform: (v) => v ? "✓" : "✗" },
            { label: "New Follower", key: "email_new_follower", transform: (v) => v ? "✓" : "✗" },
            { label: "New Application", key: "email_new_application", transform: (v) => v ? "✓" : "✗" },
            { label: "Application Status", key: "email_application_status", transform: (v) => v ? "✓" : "✗" },
            { label: "Review Received", key: "email_review_received", transform: (v) => v ? "✓" : "✗" },
            { label: "Endorsement Received", key: "email_endorsement_received", transform: (v) => v ? "✓" : "✗" },
            { label: "Gig Updates", key: "email_gig_updates", transform: (v) => v ? "✓" : "✗" },
            { label: "Mention", key: "email_mention", transform: (v) => v ? "✓" : "✗" },
            { label: "Upvote Milestone", key: "email_upvote_milestone", transform: (v) => v ? "✓" : "✗" },
          ],
          result.data,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Update settings ────────────────────────────────────────────

  notifSettings
    .command("update")
    .description("Update notification settings")
    .option("--email-new-message <bool>", "Email on new message")
    .option("--email-new-comment <bool>", "Email on new comment")
    .option("--email-new-follower <bool>", "Email on new follower")
    .option("--email-new-application <bool>", "Email on new application")
    .option("--email-application-status <bool>", "Email on application status change")
    .option("--email-review-received <bool>", "Email on review received")
    .option("--email-endorsement-received <bool>", "Email on endorsement received")
    .option("--email-gig-updates <bool>", "Email on gig updates")
    .option("--email-mention <bool>", "Email on mention")
    .option("--email-upvote-milestone <bool>", "Email on upvote milestone")
    .action(
      async (cmdOpts: {
        emailNewMessage?: string;
        emailNewComment?: string;
        emailNewFollower?: string;
        emailNewApplication?: string;
        emailApplicationStatus?: string;
        emailReviewReceived?: string;
        emailEndorsementReceived?: string;
        emailGigUpdates?: string;
        emailMention?: string;
        emailUpvoteMilestone?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Updating notification settings...").start();
        try {
          const client = createClient(opts);

          const parseBool = (v: string | undefined): boolean | undefined => {
            if (v === undefined) return undefined;
            return v === "true" || v === "1" || v === "yes";
          };

          const body: Record<string, boolean> = {};
          const mapping: Record<string, string | undefined> = {
            email_new_message: cmdOpts.emailNewMessage,
            email_new_comment: cmdOpts.emailNewComment,
            email_new_follower: cmdOpts.emailNewFollower,
            email_new_application: cmdOpts.emailNewApplication,
            email_application_status: cmdOpts.emailApplicationStatus,
            email_review_received: cmdOpts.emailReviewReceived,
            email_endorsement_received: cmdOpts.emailEndorsementReceived,
            email_gig_updates: cmdOpts.emailGigUpdates,
            email_mention: cmdOpts.emailMention,
            email_upvote_milestone: cmdOpts.emailUpvoteMilestone,
          };

          for (const [key, val] of Object.entries(mapping)) {
            const parsed = parseBool(val);
            if (parsed !== undefined) body[key] = parsed;
          }

          if (Object.keys(body).length === 0) {
            spinner?.stop();
            console.log("  No settings provided. Use --email-* flags to update.");
            return;
          }

          const result = await client.put<{
            data: Record<string, unknown>;
          }>("/api/notification-settings", body);
          spinner?.stop();
          printSuccess("Notification settings updated", opts as OutputOptions);
          printDetail(
            [
              { label: "New Message", key: "email_new_message", transform: (v) => v ? "✓" : "✗" },
              { label: "New Comment", key: "email_new_comment", transform: (v) => v ? "✓" : "✗" },
              { label: "New Follower", key: "email_new_follower", transform: (v) => v ? "✓" : "✗" },
              { label: "New Application", key: "email_new_application", transform: (v) => v ? "✓" : "✗" },
              { label: "Application Status", key: "email_application_status", transform: (v) => v ? "✓" : "✗" },
              { label: "Review Received", key: "email_review_received", transform: (v) => v ? "✓" : "✗" },
              { label: "Endorsement Received", key: "email_endorsement_received", transform: (v) => v ? "✓" : "✗" },
              { label: "Gig Updates", key: "email_gig_updates", transform: (v) => v ? "✓" : "✗" },
              { label: "Mention", key: "email_mention", transform: (v) => v ? "✓" : "✗" },
              { label: "Upvote Milestone", key: "email_upvote_milestone", transform: (v) => v ? "✓" : "✗" },
            ],
            result.data,
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );
}
