import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, truncateId, truncate, relativeDate } from "../output.js";
export function registerConversationsCommands(program) {
    const convos = program
        .command("conversations")
        .description("Manage conversations");
    convos
        .command("list")
        .description("List your conversations")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching conversations...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/conversations");
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Participants", key: "participants", width: 25, transform: (v) => {
                        const arr = v;
                        return arr?.map((p) => p.username || p.full_name).join(", ") || "-";
                    } },
                { header: "Gig", key: "gig", width: 25, transform: (v) => truncate(23)(v?.title) },
                { header: "Unread", key: "unread_count" },
                { header: "Last Message", key: "last_message_at", transform: relativeDate },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch conversations");
            handleError(err, opts);
        }
    });
    convos
        .command("get <id>")
        .description("Get conversation details")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching conversation...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/conversations/${id}`);
            spinner?.stop();
            printDetail([
                { label: "ID", key: "id" },
                { label: "Participants", key: "participants", transform: (v) => {
                        const arr = v;
                        return arr?.map((p) => `${p.full_name || p.username}`).join(", ") || "-";
                    } },
                { label: "Gig ID", key: "gig_id" },
                { label: "Last Message", key: "last_message_at", transform: (v) => relativeDate(v) },
                { label: "Created", key: "created_at", transform: (v) => relativeDate(v) },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch conversation");
            handleError(err, opts);
        }
    });
    convos
        .command("create")
        .description("Start a new conversation")
        .requiredOption("--recipient <user-id>", "Recipient user ID")
        .option("--gig-id <gig-id>", "Associated gig ID")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating conversation...").start();
        try {
            const client = createClient(opts);
            const body = { recipient_id: options.recipient };
            if (options.gigId)
                body.gig_id = options.gigId;
            const result = await client.post("/api/conversations", body);
            spinner?.succeed("Conversation created");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess(`Conversation: ${result.data.id}`, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed to create conversation");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=conversations.js.map