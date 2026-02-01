import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printSuccess,
  type OutputOptions,
  truncate,
  relativeDate,
} from "../output.js";

export function registerEndorsementsCommands(program: Command): void {
  // `ugig endorsements @username` — view endorsements
  program
    .command("endorsements [username]")
    .description("View skill endorsements for a user")
    .option("--skill <skill>", "Filter by skill")
    .action(async (username: string | undefined, options: { skill?: string }) => {
      const opts = program.opts() as GlobalOpts;

      if (!username) {
        printError("Usage: ugig endorsements @username", opts);
        process.exitCode = 1;
        return;
      }

      // Strip leading @ if present
      const cleanUsername = username.replace(/^@/, "");

      const spinner = opts.json ? null : ora("Fetching endorsements...").start();
      try {
        const client = createClient(opts);
        const params: Record<string, string | undefined> = {};
        if (options.skill) params.skill = options.skill;

        const result = await client.get<{
          data: {
            skill: string;
            count: number;
            endorsers: {
              id: string;
              username: string;
              full_name: string | null;
              comment: string | null;
              created_at: string;
            }[];
          }[];
          total_endorsements: number;
        }>(`/api/users/${encodeURIComponent(cleanUsername)}/endorsements`, params);

        spinner?.stop();

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.data.length === 0) {
          console.log(`  No endorsements found for @${cleanUsername}.`);
          return;
        }

        console.log(`\n  Endorsements for @${cleanUsername} (${result.total_endorsements} total)\n`);

        // Flatten for table display
        const rows: Record<string, unknown>[] = [];
        for (const group of result.data) {
          if (options.skill && group.skill !== options.skill) continue;
          for (const endorser of group.endorsers) {
            rows.push({
              skill: group.skill,
              count: group.count,
              endorser: endorser.full_name || `@${endorser.username}`,
              comment: endorser.comment,
              created_at: endorser.created_at,
            });
          }
        }

        if (rows.length === 0) {
          // Show summary view instead
          const summaryRows = result.data.map((g) => ({
            skill: g.skill,
            count: g.count,
            endorsers: g.endorsers
              .map((e) => e.full_name || `@${e.username}`)
              .slice(0, 3)
              .join(", "),
          }));
          printTable(
            [
              { header: "Skill", key: "skill", width: 25 },
              { header: "Count", key: "count", width: 8 },
              { header: "Endorsed by", key: "endorsers", width: 40 },
            ],
            summaryRows,
            opts as OutputOptions
          );
        } else {
          printTable(
            [
              { header: "Skill", key: "skill", width: 20 },
              { header: "#", key: "count", width: 5 },
              { header: "Endorsed by", key: "endorser", width: 20 },
              { header: "Comment", key: "comment", width: 30, transform: truncate(28) },
              { header: "Date", key: "created_at", transform: relativeDate },
            ],
            rows,
            opts as OutputOptions
          );
        }
      } catch (err) {
        spinner?.fail("Failed to fetch endorsements");
        handleError(err, opts as OutputOptions);
      }
    });

  // `ugig endorse @username --skill <skill>` — endorse a skill
  program
    .command("endorse <username>")
    .description("Endorse a user's skill")
    .requiredOption("--skill <skill>", "Skill to endorse")
    .option("--comment <text>", "Optional comment")
    .action(
      async (
        username: string,
        options: { skill: string; comment?: string }
      ) => {
        const opts = program.opts() as GlobalOpts;
        const cleanUsername = username.replace(/^@/, "");

        const spinner = opts.json
          ? null
          : ora(`Endorsing @${cleanUsername}'s "${options.skill}" skill...`).start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {
            skill: options.skill,
          };
          if (options.comment) body.comment = options.comment;

          const result = await client.post<{ data: Record<string, unknown> }>(
            `/api/users/${encodeURIComponent(cleanUsername)}/endorse`,
            body
          );

          spinner?.succeed(
            `Endorsed @${cleanUsername}'s "${options.skill}" skill`
          );

          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            printSuccess(
              `Successfully endorsed @${cleanUsername}'s "${options.skill}" skill.`,
              opts as OutputOptions
            );
          }
        } catch (err) {
          spinner?.fail("Failed to endorse");
          handleError(err, opts as OutputOptions);
        }
      }
    );

  // `ugig unendorse @username --skill <skill>` — remove endorsement
  program
    .command("unendorse <username>")
    .description("Remove a skill endorsement")
    .requiredOption("--skill <skill>", "Skill to un-endorse")
    .action(async (username: string, options: { skill: string }) => {
      const opts = program.opts() as GlobalOpts;
      const cleanUsername = username.replace(/^@/, "");

      const spinner = opts.json
        ? null
        : ora(`Removing endorsement...`).start();
      try {
        const client = createClient(opts);
        await client.delete(
          `/api/users/${encodeURIComponent(cleanUsername)}/endorse?skill=${encodeURIComponent(options.skill)}`
        );

        spinner?.succeed("Endorsement removed");
        printSuccess(
          `Removed endorsement of @${cleanUsername}'s "${options.skill}" skill.`,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed to remove endorsement");
        handleError(err, opts as OutputOptions);
      }
    });
}

// Helper — copied to avoid circular dep in this context
function printError(msg: string, opts: OutputOptions) {
  if (opts.json) {
    console.log(JSON.stringify({ error: msg }));
  } else {
    console.error(`  Error: ${msg}`);
  }
}
