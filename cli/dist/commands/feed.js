import ora from "ora";
import { createUnauthClient, handleError } from "../helpers.js";
import { printTable, truncateId, truncate, relativeDate, } from "../output.js";
export function registerFeedCommands(program) {
    const feed = program
        .command("feed")
        .description("Browse the feed")
        .option("--sort <sort>", "Sort: hot, new, top, rising", "hot")
        .option("--tag <tag>", "Filter by tag")
        .option("--page <n>", "Page number", (v) => Number(v), 1)
        .option("--limit <n>", "Results per page", (v) => Number(v), 20)
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching feed...").start();
        try {
            const client = createUnauthClient(opts);
            const params = {
                sort: options.sort,
                tag: options.tag,
                page: options.page,
                limit: options.limit,
            };
            const result = await client.get("/api/feed", params);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Author", key: "author", width: 16, transform: formatAuthor },
                { header: "Content", key: "content", width: 40, transform: truncate(38) },
                { header: "Score", key: "score", width: 8 },
                { header: "Tags", key: "tags", width: 20, transform: formatTags },
                { header: "Posted", key: "created_at", transform: relativeDate },
            ], result.posts, opts, {
                page: result.pagination.page,
                total: result.pagination.total,
                totalPages: result.pagination.totalPages,
            });
        }
        catch (err) {
            spinner?.fail("Failed to fetch feed");
            handleError(err, opts);
        }
    });
}
function formatAuthor(value) {
    if (value && typeof value === "object" && "username" in value) {
        return String(value.username || "unknown");
    }
    return "unknown";
}
function formatTags(value) {
    if (Array.isArray(value)) {
        return value.map((t) => `#${t}`).join(", ") || "-";
    }
    return "-";
}
//# sourceMappingURL=feed.js.map