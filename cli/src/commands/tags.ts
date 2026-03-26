import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printSuccess, type OutputOptions } from "../output.js";

export function registerTagsCommands(program: Command): void {
  const tags = program.command("tags").description("Tag management");

  // ── Popular tags ───────────────────────────────────────────────

  tags
    .command("popular")
    .description("List popular tags")
    .option("--limit <n>", "Max tags to return", "50")
    .action(async (cmdOpts: { limit?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching popular tags...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          tags: Record<string, unknown>[];
        }>("/api/tags/popular", { limit: cmdOpts.limit });
        spinner?.stop();
        printTable(
          [
            { header: "Tag", key: "tag", width: 30 },
            { header: "Gigs", key: "gig_count", width: 10 },
            { header: "Followers", key: "follower_count", width: 12 },
          ],
          result.tags,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Following tags ─────────────────────────────────────────────

  tags
    .command("following")
    .description("List tags you follow")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching followed tags...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ tags: string[] }>("/api/tags/following");
        spinner?.stop();
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.tags.length === 0) {
          console.log("  You are not following any tags.");
        } else {
          printTable(
            [{ header: "Tag", key: "tag", width: 40 }],
            result.tags.map((t) => ({ tag: t })),
            opts as OutputOptions,
          );
        }
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Follow tag ─────────────────────────────────────────────────

  tags
    .command("follow <tag>")
    .description("Follow a tag")
    .action(async (tag: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora(`Following tag: ${tag}...`).start();
      try {
        const client = createClient(opts);
        await client.post(`/api/tags/${encodeURIComponent(tag)}/follow`);
        spinner?.stop();
        printSuccess(`Now following tag: ${tag}`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Unfollow tag ───────────────────────────────────────────────

  tags
    .command("unfollow <tag>")
    .description("Unfollow a tag")
    .action(async (tag: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora(`Unfollowing tag: ${tag}...`).start();
      try {
        const client = createClient(opts);
        await client.delete(`/api/tags/${encodeURIComponent(tag)}/follow`);
        spinner?.stop();
        printSuccess(`Unfollowed tag: ${tag}`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
