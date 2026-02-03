import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printDetail, printSuccess, type OutputOptions, truncateId, relativeDate, formatDate } from "../output.js";

export function registerVideoCallsCommands(program: Command): void {
  const calls = program
    .command("calls")
    .description("Manage video calls");

  calls
    .command("list")
    .description("List video calls")
    .option("--upcoming", "Only upcoming calls")
    .option("--limit <n>", "Number of results", (v: string) => Number(v), 20)
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching calls...").start();
      try {
        const client = createClient(opts);
        const params: Record<string, string | number | boolean | undefined> = {
          upcoming: options.upcoming ? true : undefined,
          limit: options.limit,
        };
        const result = await client.get<{ data: Record<string, unknown>[] }>("/api/video-calls", params);
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Room", key: "room_id", width: 20 },
            { header: "Scheduled", key: "scheduled_at", transform: formatDate },
            { header: "Started", key: "started_at", transform: (v) => v ? formatDate(v) : "-" },
            { header: "Ended", key: "ended_at", transform: (v) => v ? formatDate(v) : "-" },
          ],
          result.data,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  calls
    .command("get <id>")
    .description("Get call details")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching call...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ data: Record<string, unknown> }>(`/api/video-calls/${id}`);
        spinner?.stop();
        printDetail(
          [
            { label: "ID", key: "id" },
            { label: "Room ID", key: "room_id" },
            { label: "Initiator", key: "initiator_id" },
            { label: "Gig ID", key: "gig_id" },
            { label: "Scheduled", key: "scheduled_at", transform: formatDate },
            { label: "Started", key: "started_at", transform: formatDate },
            { label: "Ended", key: "ended_at", transform: formatDate },
            { label: "Created", key: "created_at", transform: formatDate },
          ],
          result.data,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
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
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating call...").start();
      try {
        const client = createClient(opts);
        const body: Record<string, unknown> = {
          participant_ids: [options.participant],
        };
        if (options.gigId) body.gig_id = options.gigId;
        if (options.applicationId) body.application_id = options.applicationId;
        if (options.scheduledAt) body.scheduled_at = options.scheduledAt;
        const result = await client.post<{ data: Record<string, unknown> }>("/api/video-calls", body);
        spinner?.succeed("Call created");
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printSuccess(`Call created: ${result.data.id}`, opts as OutputOptions);
        }
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  calls
    .command("start <id>")
    .description("Start a video call")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.patch(`/api/video-calls/${id}`, { action: "start" });
        printSuccess("Call started.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  calls
    .command("end <id>")
    .description("End a video call")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.patch(`/api/video-calls/${id}`, { action: "end" });
        printSuccess("Call ended.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  calls
    .command("cancel <id>")
    .description("Cancel a video call")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        await client.delete(`/api/video-calls/${id}`);
        printSuccess("Call cancelled.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });
}
