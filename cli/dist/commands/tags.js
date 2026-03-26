import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess } from "../output.js";
export function registerTagsCommands(program) {
    const tags = program.command("tags").description("Tag management");
    // ── Popular tags ───────────────────────────────────────────────
    tags
        .command("popular")
        .description("List popular tags")
        .option("--limit <n>", "Max tags to return", "50")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching popular tags...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/tags/popular", { limit: cmdOpts.limit });
            spinner?.stop();
            printTable([
                { header: "Tag", key: "tag", width: 30 },
                { header: "Gigs", key: "gig_count", width: 10 },
                { header: "Followers", key: "follower_count", width: 12 },
            ], result.tags, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Following tags ─────────────────────────────────────────────
    tags
        .command("following")
        .description("List tags you follow")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching followed tags...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/tags/following");
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else if (result.tags.length === 0) {
                console.log("  You are not following any tags.");
            }
            else {
                printTable([{ header: "Tag", key: "tag", width: 40 }], result.tags.map((t) => ({ tag: t })), opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Follow tag ─────────────────────────────────────────────────
    tags
        .command("follow <tag>")
        .description("Follow a tag")
        .action(async (tag) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora(`Following tag: ${tag}...`).start();
        try {
            const client = createClient(opts);
            await client.post(`/api/tags/${encodeURIComponent(tag)}/follow`);
            spinner?.stop();
            printSuccess(`Now following tag: ${tag}`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Unfollow tag ───────────────────────────────────────────────
    tags
        .command("unfollow <tag>")
        .description("Unfollow a tag")
        .action(async (tag) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora(`Unfollowing tag: ${tag}...`).start();
        try {
            const client = createClient(opts);
            await client.delete(`/api/tags/${encodeURIComponent(tag)}/follow`);
            spinner?.stop();
            printSuccess(`Unfollowed tag: ${tag}`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=tags.js.map