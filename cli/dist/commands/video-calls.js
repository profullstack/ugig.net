import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, truncateId, formatDate } from "../output.js";
export function registerVideoCallsCommands(program) {
    const calls = program
        .command("calls")
        .description("Manage video calls");
    calls
        .command("list")
        .description("List video calls")
        .option("--upcoming", "Only upcoming calls")
        .option("--limit <n>", "Number of results", parseInt, 20)
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching calls...").start();
        try {
            const client = createClient(opts);
            const params = {
                upcoming: options.upcoming ? true : undefined,
                limit: options.limit,
            };
            const result = await client.get("/api/video-calls", params);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Room", key: "room_id", width: 20 },
                { header: "Scheduled", key: "scheduled_at", transform: formatDate },
                { header: "Started", key: "started_at", transform: (v) => v ? formatDate(v) : "-" },
                { header: "Ended", key: "ended_at", transform: (v) => v ? formatDate(v) : "-" },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    calls
        .command("get <id>")
        .description("Get call details")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching call...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/video-calls/${id}`);
            spinner?.stop();
            printDetail([
                { label: "ID", key: "id" },
                { label: "Room ID", key: "room_id" },
                { label: "Initiator", key: "initiator_id" },
                { label: "Gig ID", key: "gig_id" },
                { label: "Scheduled", key: "scheduled_at", transform: formatDate },
                { label: "Started", key: "started_at", transform: formatDate },
                { label: "Ended", key: "ended_at", transform: formatDate },
                { label: "Created", key: "created_at", transform: formatDate },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    calls
        .command("create")
        .description("Create a video call")
        .requiredOption("--participant <user-id>", "Participant user ID")
        .option("--gig-id <id>", "Associated gig ID")
        .option("--application-id <id>", "Associated application ID")
        .option("--scheduled-at <datetime>", "Scheduled time (ISO 8601)")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating call...").start();
        try {
            const client = createClient(opts);
            const body = {
                participant_ids: [options.participant],
            };
            if (options.gigId)
                body.gig_id = options.gigId;
            if (options.applicationId)
                body.application_id = options.applicationId;
            if (options.scheduledAt)
                body.scheduled_at = options.scheduledAt;
            const result = await client.post("/api/video-calls", body);
            spinner?.succeed("Call created");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess(`Call created: ${result.data.id}`, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    calls
        .command("start <id>")
        .description("Start a video call")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.patch(`/api/video-calls/${id}`, { action: "start" });
            printSuccess("Call started.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
    calls
        .command("end <id>")
        .description("End a video call")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.patch(`/api/video-calls/${id}`, { action: "end" });
            printSuccess("Call ended.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
    calls
        .command("cancel <id>")
        .description("Cancel a video call")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.delete(`/api/video-calls/${id}`);
            printSuccess("Call cancelled.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=video-calls.js.map