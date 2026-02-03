import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, truncateId, truncate, relativeDate } from "../output.js";
export function registerNotificationsCommands(program) {
    const notif = program
        .command("notifications")
        .description("Manage notifications");
    notif
        .command("list")
        .description("List notifications")
        .option("--unread", "Only show unread")
        .option("--limit <n>", "Number of results", (v) => Number(v), 20)
        .option("--offset <n>", "Offset", (v) => Number(v), 0)
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching notifications...").start();
        try {
            const client = createClient(opts);
            const params = {
                limit: options.limit,
                offset: options.offset,
                unread: options.unread ? true : undefined,
            };
            const result = await client.get("/api/notifications", params);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Type", key: "type", width: 18 },
                { header: "Title", key: "title", width: 30, transform: truncate(28) },
                { header: "Read", key: "read_at", transform: (v) => v ? "Yes" : "No" },
                { header: "When", key: "created_at", transform: relativeDate },
            ], result.notifications, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch notifications");
            handleError(err, opts);
        }
    });
    notif
        .command("read <id>")
        .description("Mark a notification as read")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.put(`/api/notifications/${id}/read`);
            printSuccess("Notification marked as read.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
    notif
        .command("read-all")
        .description("Mark all notifications as read")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Marking all as read...").start();
        try {
            const client = createClient(opts);
            const result = await client.put("/api/notifications/read-all");
            spinner?.succeed("All notifications marked as read");
            printSuccess(`Marked ${result.count || 0} notifications as read.`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    notif
        .command("delete <id>")
        .description("Delete a notification")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.delete(`/api/notifications/${id}`);
            printSuccess("Notification deleted.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=notifications.js.map