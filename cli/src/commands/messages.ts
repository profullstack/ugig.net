import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printSuccess, type OutputOptions, truncateId, truncate, relativeDate } from "../output.js";

export function registerMessagesCommands(program: Command): void {
  const msgs = program
    .command("messages")
    .description("Send and read messages");

  msgs
    .command("list <conversation-id>")
    .description("List messages in a conversation")
    .option("--cursor <timestamp>", "Cursor for pagination")
    .option("--limit <n>", "Number of messages", parseInt, 50)
    .action(async (conversationId: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching messages...").start();
      try {
        const client = createClient(opts);
        const params: Record<string, string | number | undefined> = {
          limit: options.limit,
          cursor: options.cursor,
        };
        const result = await client.get<{ data: Record<string, unknown>[]; hasMore: boolean; nextCursor?: string }>(
          `/api/conversations/${conversationId}/messages`,
          params
        );
        spinner?.stop();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.data.length === 0) {
          console.log(chalk.dim("  No messages yet."));
          return;
        }

        for (const msg of result.data) {
          const sender = msg.sender as Record<string, unknown>;
          const name = sender?.full_name || sender?.username || "Unknown";
          const time = relativeDate(msg.created_at);
          const content = String(msg.content || "");
          console.log(`  ${chalk.bold(String(name))} ${chalk.dim(time)}`);
          console.log(`  ${content}`);
          console.log();
        }

        if (result.hasMore && result.nextCursor) {
          console.log(chalk.dim(`  More messages available. Use --cursor ${result.nextCursor}`));
        }
      } catch (err) {
        spinner?.fail("Failed to fetch messages");
        handleError(err, opts as OutputOptions);
      }
    });

  msgs
    .command("send <conversation-id>")
    .description("Send a message")
    .requiredOption("--content <text>", "Message content")
    .action(async (conversationId: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Sending message...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{ data: Record<string, unknown> }>(
          `/api/conversations/${conversationId}/messages`,
          { content: options.content }
        );
        spinner?.succeed("Message sent");
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess("Message sent.", opts as OutputOptions);
        }
      } catch (err) {
        spinner?.fail("Failed to send message");
        handleError(err, opts as OutputOptions);
      }
    });

  msgs
    .command("read <message-id>")
    .description("Mark a message as read")
    .action(async (messageId: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.put(`/api/messages/${messageId}/read`);
        printSuccess("Message marked as read.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });
}
