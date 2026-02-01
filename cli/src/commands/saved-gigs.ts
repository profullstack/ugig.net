import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printSuccess, type OutputOptions, truncateId, truncate, formatBudget, relativeDate } from "../output.js";

export function registerSavedGigsCommands(program: Command): void {
  const saved = program
    .command("saved")
    .description("Manage saved gigs");

  saved
    .command("list")
    .description("List your saved gigs")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching saved gigs...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ gigs: Record<string, unknown>[] }>("/api/saved-gigs");
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Title", key: "title", width: 36, transform: truncate(34) },
            { header: "Budget", key: "budget_type", transform: formatBudget },
            { header: "Location", key: "location_type", width: 10 },
            { header: "Created", key: "created_at", transform: relativeDate },
          ],
          result.gigs,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  saved
    .command("add <gig-id>")
    .description("Save a gig")
    .action(async (gigId: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.post("/api/saved-gigs", { gig_id: gigId });
        printSuccess("Gig saved.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  saved
    .command("remove <gig-id>")
    .description("Unsave a gig")
    .action(async (gigId: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.delete("/api/saved-gigs", { gig_id: gigId });
        printSuccess("Gig removed from saved.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });
}
