import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { createClient, createUnauthClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, type OutputOptions, relativeDate, truncate } from "../output.js";

const ACTIVITY_ICONS: Record<string, string> = {
  gig_posted: "📋",
  gig_applied: "📨",
  gig_completed: "✅",
  review_given: "⭐",
  review_received: "🏆",
  post_created: "📝",
  comment_posted: "💬",
  endorsement_given: "👍",
  endorsement_received: "🎖️",
  followed_user: "👤",
};

function formatActivityType(value: unknown): string {
  const type = String(value || "");
  const icon = ACTIVITY_ICONS[type] || "📌";
  const label = type.replace(/_/g, " ");
  return `${icon} ${label}`;
}

function formatDescription(_: unknown, row: Record<string, unknown>): string {
  const metadata = (row.metadata || {}) as Record<string, unknown>;
  const type = String(row.activity_type || "");

  switch (type) {
    case "gig_posted":
    case "gig_applied":
    case "gig_completed":
      return metadata.gig_title ? String(metadata.gig_title) : "-";
    case "review_given":
      return metadata.reviewee_name
        ? `${"★".repeat(Number(metadata.rating) || 0)} for ${metadata.reviewee_name}`
        : "-";
    case "review_received":
      return metadata.reviewer_name
        ? `${"★".repeat(Number(metadata.rating) || 0)} from ${metadata.reviewer_name}`
        : "-";
    default:
      return metadata.gig_title ? String(metadata.gig_title) : "-";
  }
}

export function registerActivityCommands(program: Command): void {
  program
    .command("activity [username]")
    .description("View activity feed for a user or your own")
    .option("--limit <n>", "Number of results", (v: string) => Number(v), 20)
    .option("--offset <n>", "Offset", (v: string) => Number(v), 0)
    .action(async (username: string | undefined, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching activity...").start();
      try {
        let result: { data: Record<string, unknown>[]; pagination: Record<string, number> };

        if (username) {
          // Strip @ prefix if present
          const cleanUsername = username.startsWith("@") ? username.slice(1) : username;
          const client = createUnauthClient(opts);
          result = await client.get<typeof result>(
            `/api/users/${cleanUsername}/activity`,
            { limit: options.limit, offset: options.offset }
          );
        } else {
          // Own activity (needs auth)
          const client = createClient(opts);
          result = await client.get<typeof result>(
            "/api/activity",
            { limit: options.limit, offset: options.offset }
          );
        }

        spinner?.stop();

        if (!opts.json && result.data.length > 0) {
          const displayUsername = username
            ? (username.startsWith("@") ? username : `@${username}`)
            : "Your";
          console.log(chalk.bold(`\n  ${displayUsername} activity\n`));
        }

        printTable(
          [
            { header: "Type", key: "activity_type", width: 20, transform: formatActivityType },
            { header: "Details", key: "metadata", width: 45, transform: formatDescription },
            { header: "When", key: "created_at", width: 12, transform: relativeDate },
          ],
          result.data,
          opts as OutputOptions,
          {
            page: Math.floor(options.offset / options.limit) + 1,
            total: result.pagination.total,
            totalPages: Math.ceil(result.pagination.total / options.limit),
            limit: options.limit,
          }
        );
      } catch (err) {
        spinner?.fail("Failed to fetch activity");
        handleError(err, opts as OutputOptions);
      }
    });
}
