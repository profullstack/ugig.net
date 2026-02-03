import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printSuccess, type OutputOptions, truncateId, truncate, relativeDate } from "../output.js";

export function registerNotificationsCommands(program: Command): void {
  const notif = program
    .command("notifications")
    .description("Manage notifications");

  notif
    .command("list")
    .description("List notifications")
    .option("--unread", "Only show unread")
    .option("--limit <n>", "Number of results", (v: string) => Number(v), 20)
    .option("--offset <n>", "Offset", (v: string) => Number(v), 0)
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching notifications...").start();
      try {
        const client = createClient(opts);
        const params: Record<string, string | number | boolean | undefined> = {
          limit: options.limit,
          offset: options.offset,
          unread: options.unread ? true : undefined,
        };
        const result = await client.get<{
          notifications: Record<string, unknown>[];
          pagination: Record<string, number>;
          unread_count: number;
        }>("/api/notifications", params);
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Type", key: "type", width: 18 },
            { header: "Title", key: "title", width: 30, transform: truncate(28) },
            { header: "Read", key: "read_at", transform: (v) => v ? "Yes" : "No" },
            { header: "When", key: "created_at", transform: relativeDate },
          ],
          result.notifications,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to fetch notifications");
        handleError(err, opts as OutputOptions);
      }
    });

  notif
    .command("read <id>")
    .description("Mark a notification as read")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.put(`/api/notifications/${id}/read`);
        printSuccess("Notification marked as read.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  notif
    .command("read-all")
    .description("Mark all notifications as read")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Marking all as read...").start();
      try {
        const client = createClient(opts);
        const result = await client.put<{ count: number }>("/api/notifications/read-all");
        spinner?.succeed("All notifications marked as read");
        printSuccess(`Marked ${result.count || 0} notifications as read.`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  notif
    .command("delete <id>")
    .description("Delete a notification")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.delete(`/api/notifications/${id}`);
        printSuccess("Notification deleted.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });
}
