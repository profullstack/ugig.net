import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, truncateId, truncate, formatDate } from "../output.js";
export function registerWorkHistoryCommands(program) {
    const wh = program
        .command("work-history")
        .description("Manage work history");
    wh
        .command("list")
        .description("List your work history")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching work history...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/work-history");
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Company", key: "company", width: 20, transform: truncate(18) },
                { header: "Position", key: "position", width: 25, transform: truncate(23) },
                { header: "Start", key: "start_date", transform: formatDate },
                { header: "End", key: "end_date", transform: (v) => v ? formatDate(v) : "Current" },
                { header: "Location", key: "location", width: 15, transform: truncate(13) },
            ], result.work_history, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    wh
        .command("create")
        .description("Add work history entry")
        .requiredOption("--company <company>", "Company name")
        .requiredOption("--position <position>", "Position/title")
        .option("--description <desc>", "Description")
        .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)")
        .option("--end-date <date>", "End date (YYYY-MM-DD)")
        .option("--is-current", "Currently working here")
        .option("--location <location>", "Location")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Adding work history...").start();
        try {
            const client = createClient(opts);
            const body = {
                company: options.company,
                position: options.position,
                start_date: options.startDate,
            };
            if (options.description)
                body.description = options.description;
            if (options.endDate)
                body.end_date = options.endDate;
            if (options.isCurrent)
                body.is_current = true;
            if (options.location)
                body.location = options.location;
            const result = await client.post("/api/work-history", body);
            spinner?.succeed("Work history added");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess(`Added: ${result.work_history.id}`, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    wh
        .command("update <id>")
        .description("Update work history entry")
        .option("--company <company>", "Company name")
        .option("--position <pos>", "Position")
        .option("--description <desc>", "Description")
        .option("--start-date <date>", "Start date")
        .option("--end-date <date>", "End date")
        .option("--is-current", "Currently working here")
        .option("--location <loc>", "Location")
        .action(async (id, options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (options.company !== undefined)
                body.company = options.company;
            if (options.position !== undefined)
                body.position = options.position;
            if (options.description !== undefined)
                body.description = options.description;
            if (options.startDate !== undefined)
                body.start_date = options.startDate;
            if (options.endDate !== undefined)
                body.end_date = options.endDate;
            if (options.isCurrent !== undefined)
                body.is_current = options.isCurrent;
            if (options.location !== undefined)
                body.location = options.location;
            await client.put(`/api/work-history/${id}`, body);
            spinner?.succeed("Updated");
            printSuccess("Work history updated.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    wh
        .command("delete <id>")
        .description("Delete work history entry")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.delete(`/api/work-history/${id}`);
            printSuccess("Work history entry deleted.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=work-history.js.map