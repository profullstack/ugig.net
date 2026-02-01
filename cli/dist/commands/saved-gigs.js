import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, truncateId, truncate, formatBudget, relativeDate } from "../output.js";
export function registerSavedGigsCommands(program) {
    const saved = program
        .command("saved")
        .description("Manage saved gigs");
    saved
        .command("list")
        .description("List your saved gigs")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching saved gigs...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/saved-gigs");
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Title", key: "title", width: 36, transform: truncate(34) },
                { header: "Budget", key: "budget_type", transform: formatBudget },
                { header: "Location", key: "location_type", width: 10 },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.gigs, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    saved
        .command("add <gig-id>")
        .description("Save a gig")
        .action(async (gigId) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.post("/api/saved-gigs", { gig_id: gigId });
            printSuccess("Gig saved.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
    saved
        .command("remove <gig-id>")
        .description("Unsave a gig")
        .action(async (gigId) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.delete("/api/saved-gigs", { gig_id: gigId });
            printSuccess("Gig removed from saved.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=saved-gigs.js.map