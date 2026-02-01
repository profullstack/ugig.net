import ora from "ora";
import chalk from "chalk";
import { createClient, handleError } from "../helpers.js";
import { printSuccess, relativeDate } from "../output.js";
export function registerMessagesCommands(program) {
    const msgs = program
        .command("messages")
        .description("Send and read messages");
    msgs
        .command("list <conversation-id>")
        .description("List messages in a conversation")
        .option("--cursor <timestamp>", "Cursor for pagination")
        .option("--limit <n>", "Number of messages", parseInt, 50)
        .action(async (conversationId, options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching messages...").start();
        try {
            const client = createClient(opts);
            const params = {
                limit: options.limit,
                cursor: options.cursor,
            };
            const result = await client.get(`/api/conversations/${conversationId}/messages`, params);
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
                const sender = msg.sender;
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
        }
        catch (err) {
            spinner?.fail("Failed to fetch messages");
            handleError(err, opts);
        }
    });
    msgs
        .command("send <conversation-id>")
        .description("Send a message")
        .requiredOption("--content <text>", "Message content")
        .action(async (conversationId, options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Sending message...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/conversations/${conversationId}/messages`, { content: options.content });
            spinner?.succeed("Message sent");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess("Message sent.", opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed to send message");
            handleError(err, opts);
        }
    });
    msgs
        .command("read <message-id>")
        .description("Mark a message as read")
        .action(async (messageId) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.put(`/api/messages/${messageId}/read`);
            printSuccess("Message marked as read.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=messages.js.map