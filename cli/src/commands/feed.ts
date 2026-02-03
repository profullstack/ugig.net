import type { Command } from "commander";
import ora from "ora";
import { createUnauthClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable, type OutputOptions,
  truncateId, truncate, relativeDate,
} from "../output.js";

export function registerFeedCommands(program: Command): void {
  const feed = program
    .command("feed")
    .description("Browse the feed")
    .option("--sort <sort>", "Sort: hot, new, top, rising", "hot")
    .option("--tag <tag>", "Filter by tag")
    .option("--page <n>", "Page number", (v: string) => Number(v), 1)
    .option("--limit <n>", "Results per page", (v: string) => Number(v), 20)
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching feed...").start();
      try {
        const client = createUnauthClient(opts);
        const params: Record<string, string | number | undefined> = {
          sort: options.sort,
          tag: options.tag,
          page: options.page,
          limit: options.limit,
        };
        const result = await client.get<{
          posts: Record<string, unknown>[];
          pagination: Record<string, number>;
        }>("/api/feed", params);
        spinner?.stop();

        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Author", key: "author", width: 16, transform: formatAuthor },
            { header: "Content", key: "content", width: 40, transform: truncate(38) },
            { header: "Score", key: "score", width: 8 },
            { header: "Tags", key: "tags", width: 20, transform: formatTags },
            { header: "Posted", key: "created_at", transform: relativeDate },
          ],
          result.posts,
          opts as OutputOptions,
          {
            page: result.pagination.page,
            total: result.pagination.total,
            totalPages: result.pagination.totalPages,
          }
        );
      } catch (err) {
        spinner?.fail("Failed to fetch feed");
        handleError(err, opts as OutputOptions);
      }
    });
}

function formatAuthor(value: unknown): string {
  if (value && typeof value === "object" && "username" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).username || "unknown");
  }
  return "unknown";
}

function formatTags(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((t) => `#${t}`).join(", ") || "-";
  }
  return "-";
}
