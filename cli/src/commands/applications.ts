import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, parseList, type GlobalOpts } from "../helpers.js";
import {
  printTable, printDetail, printSuccess, type OutputOptions,
  truncateId, truncate, colorizeStatus, relativeDate,
} from "../output.js";

export function registerApplicationsCommands(program: Command): void {
  const apps = program
    .command("applications")
    .description("Manage applications");

  apps
    .command("list")
    .description("List your applications")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching applications...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ applications: Record<string, unknown>[] }>("/api/applications/my");
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Gig", key: "gig", width: 30, transform: (v) => truncate(28)((v as Record<string, unknown>)?.title) },
            { header: "Status", key: "status", transform: colorizeStatus },
            { header: "Rate", key: "proposed_rate", transform: (v) => v ? `$${v}` : "-" },
            { header: "Applied", key: "created_at", transform: relativeDate },
          ],
          result.applications,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to fetch applications");
        handleError(err, opts as OutputOptions);
      }
    });

  apps
    .command("for-gig <gig-id>")
    .description("List applications for a gig you posted")
    .action(async (gigId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching applications...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ applications: Record<string, unknown>[]; gig: Record<string, unknown> }>(
          `/api/gigs/${gigId}/applications`
        );
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Applicant", key: "applicant", width: 20, transform: (v) => {
              const a = v as Record<string, unknown>;
              return String(a?.full_name || a?.username || "-");
            }},
            { header: "Status", key: "status", transform: colorizeStatus },
            { header: "Rate", key: "proposed_rate", transform: (v) => v ? `$${v}` : "-" },
            { header: "Applied", key: "created_at", transform: relativeDate },
          ],
          result.applications,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to fetch applications");
        handleError(err, opts as OutputOptions);
      }
    });

  apps
    .command("status <id>")
    .description("Update application status")
    .requiredOption("--status <status>", "Status: pending, reviewing, shortlisted, rejected, accepted, withdrawn")
    .action(async (id: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Updating status...").start();
      try {
        const client = createClient(opts);
        await client.put(`/api/applications/${id}/status`, { status: options.status });
        spinner?.succeed(`Status updated to ${options.status}`);
        printSuccess(`Application status changed to ${options.status}.`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to update status");
        handleError(err, opts as OutputOptions);
      }
    });

  apps
    .command("bulk-status")
    .description("Bulk update application statuses")
    .requiredOption("--ids <ids>", "Application IDs (comma-separated)")
    .requiredOption("--status <status>", "Status to set")
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Updating statuses...").start();
      try {
        const client = createClient(opts);
        const ids = parseList(options.ids) || [];
        const result = await client.put<{ updated: number }>("/api/applications/bulk-status", {
          application_ids: ids,
          status: options.status,
        });
        spinner?.succeed(`Updated ${result.updated} applications`);
        printSuccess(`${result.updated} applications updated to ${options.status}.`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed to bulk update");
        handleError(err, opts as OutputOptions);
      }
    });
}

export function registerApplyShortcut(program: Command): void {
  program
    .command("apply <gig-id>")
    .description("Apply to a gig")
    .requiredOption("--cover-letter <text>", "Cover letter (50-2000 chars)")
    .option("--rate <rate>", "Proposed rate", parseFloat)
    .option("--timeline <timeline>", "Proposed timeline")
    .option("--portfolio <urls>", "Portfolio URLs (comma-separated)")
    .option("--ai-tools <tools>", "AI tools you'll use (comma-separated)")
    .action(async (gigId: string, options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Submitting application...").start();
      try {
        const client = createClient(opts);
        const body: Record<string, unknown> = {
          gig_id: gigId,
          cover_letter: options.coverLetter,
        };
        if (options.rate !== undefined) body.proposed_rate = options.rate;
        if (options.timeline) body.proposed_timeline = options.timeline;
        if (options.portfolio) body.portfolio_items = parseList(options.portfolio);
        if (options.aiTools) body.ai_tools_to_use = parseList(options.aiTools);

        const result = await client.post<{ application: Record<string, unknown> }>("/api/applications", body);
        spinner?.succeed("Application submitted");
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(`Application submitted: ${result.application.id}`, opts as OutputOptions);
        }
      } catch (err) {
        spinner?.fail("Failed to submit application");
        handleError(err, opts as OutputOptions);
      }
    });
}
