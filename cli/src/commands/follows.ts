import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printSuccess,
  type OutputOptions,
  relativeDate,
  truncate,
} from "../output.js";

export function registerFollowCommands(program: Command): void {
  // ugig follow @username
  program
    .command("follow <username>")
    .description("Follow a user")
    .action(async (username: string) => {
      const opts = program.opts() as GlobalOpts;
      // Strip leading @ if present
      const cleanUsername = username.replace(/^@/, "");
      try {
        const client = createClient(opts);
        await client.post(`/api/users/${encodeURIComponent(cleanUsername)}/follow`);
        printSuccess(`Now following @${cleanUsername}.`, opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  // ugig unfollow @username
  program
    .command("unfollow <username>")
    .description("Unfollow a user")
    .action(async (username: string) => {
      const opts = program.opts() as GlobalOpts;
      const cleanUsername = username.replace(/^@/, "");
      try {
        const client = createClient(opts);
        await client.delete(`/api/users/${encodeURIComponent(cleanUsername)}/follow`);
        printSuccess(`Unfollowed @${cleanUsername}.`, opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  // ugig followers [username]
  program
    .command("followers [username]")
    .description("List followers (yours or another user's)")
    .option("--limit <n>", "Number of results", "20")
    .option("--offset <n>", "Offset for pagination", "0")
    .action(async (username: string | undefined, cmdOpts: { limit: string; offset: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching followers...").start();
      try {
        const client = createClient(opts);

        // If no username provided, get current user's profile
        let targetUsername = username?.replace(/^@/, "");
        if (!targetUsername) {
          const profile = await client.get<{ profile: { username: string } }>("/api/profile");
          targetUsername = profile.profile.username;
        }

        const result = await client.get<{
          data: Record<string, unknown>[];
          pagination: { total: number };
        }>(`/api/users/${encodeURIComponent(targetUsername)}/followers`, {
          limit: cmdOpts.limit,
          offset: cmdOpts.offset,
        });
        spinner?.stop();

        if (!opts.json) {
          console.log(`  Followers of @${targetUsername} (${result.pagination.total} total)\n`);
        }

        printTable(
          [
            { header: "Username", key: "username", width: 20 },
            { header: "Name", key: "full_name", width: 24, transform: truncate(22) },
            { header: "Type", key: "account_type", width: 8 },
            { header: "Available", key: "is_available", width: 10, transform: (v) => v ? "Yes" : "No" },
            { header: "Since", key: "followed_at", transform: relativeDate },
          ],
          result.data,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ugig following [username]
  program
    .command("following [username]")
    .description("List who you (or another user) follow")
    .option("--limit <n>", "Number of results", "20")
    .option("--offset <n>", "Offset for pagination", "0")
    .action(async (username: string | undefined, cmdOpts: { limit: string; offset: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching following...").start();
      try {
        const client = createClient(opts);

        // If no username provided, get current user's profile
        let targetUsername = username?.replace(/^@/, "");
        if (!targetUsername) {
          const profile = await client.get<{ profile: { username: string } }>("/api/profile");
          targetUsername = profile.profile.username;
        }

        const result = await client.get<{
          data: Record<string, unknown>[];
          pagination: { total: number };
        }>(`/api/users/${encodeURIComponent(targetUsername)}/following`, {
          limit: cmdOpts.limit,
          offset: cmdOpts.offset,
        });
        spinner?.stop();

        if (!opts.json) {
          console.log(`  @${targetUsername} is following (${result.pagination.total} total)\n`);
        }

        printTable(
          [
            { header: "Username", key: "username", width: 20 },
            { header: "Name", key: "full_name", width: 24, transform: truncate(22) },
            { header: "Type", key: "account_type", width: 8 },
            { header: "Available", key: "is_available", width: 10, transform: (v) => v ? "Yes" : "No" },
            { header: "Since", key: "followed_at", transform: relativeDate },
          ],
          result.data,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
