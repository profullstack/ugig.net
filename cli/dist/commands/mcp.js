import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, relativeDate, truncate, } from "../output.js";
export function registerMcpCommands(program) {
    const mcp = program.command("mcp").description("Manage MCP server marketplace listings");
    // ── List MCP servers ───────────────────────────────────────────
    mcp
        .command("list")
        .description("List active MCP server listings")
        .option("--search <query>", "Search by title/description")
        .option("--category <cat>", "Filter by category")
        .option("--tag <tag>", "Filter by tag")
        .option("--sort <sort>", "Sort: newest|popular|rating|price_low|price_high")
        .option("--page <n>", "Page number", "1")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching MCP servers...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/mcp", {
                search: cmdOpts.search,
                category: cmdOpts.category,
                tag: cmdOpts.tag,
                sort: cmdOpts.sort,
                page: cmdOpts.page,
            });
            spinner?.stop();
            printTable([
                { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
                { header: "Title", key: "title", width: 30, transform: truncate(28) },
                { header: "Transport", key: "transport_type", width: 12, transform: (v) => v || "—" },
                { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
                { header: "Rating", key: "rating_avg", width: 8 },
                { header: "Downloads", key: "downloads_count", width: 10 },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.listings, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── View MCP server detail ─────────────────────────────────────
    mcp
        .command("view <slug>")
        .description("View details of an MCP server listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching MCP server...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/mcp/${slug}`);
            spinner?.stop();
            printDetail(result.listing, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Create MCP server listing ──────────────────────────────────
    mcp
        .command("create")
        .description("Create a new MCP server listing")
        .requiredOption("--title <title>", "MCP server title")
        .requiredOption("--description <text>", "MCP server description")
        .option("--price <sats>", "Price in sats (0 = free)", "0")
        .option("--category <cat>", "Category")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--tagline <text>", "Short tagline")
        .option("--status <status>", "Status: draft|active", "active")
        .option("--server-url <url>", "MCP server URL")
        .option("--source-url <url>", "Source code URL")
        .option("--transport <type>", "Transport type (e.g. stdio, sse, streamable-http)")
        .option("--tools <tools>", "Comma-separated list of supported tools")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating MCP server listing...").start();
        try {
            const client = createClient(opts);
            const body = {
                title: cmdOpts.title,
                description: cmdOpts.description,
                price_sats: parseInt(cmdOpts.price || "0", 10),
                status: cmdOpts.status || "active",
            };
            if (cmdOpts.category)
                body.category = cmdOpts.category;
            if (cmdOpts.tagline)
                body.tagline = cmdOpts.tagline;
            if (cmdOpts.tags)
                body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
            if (cmdOpts.serverUrl)
                body.mcp_server_url = cmdOpts.serverUrl;
            if (cmdOpts.sourceUrl)
                body.source_url = cmdOpts.sourceUrl;
            if (cmdOpts.transport)
                body.transport_type = cmdOpts.transport;
            if (cmdOpts.tools)
                body.supported_tools = cmdOpts.tools.split(",").map((t) => t.trim());
            const result = await client.post("/api/mcp", body);
            spinner?.stop();
            printSuccess(`MCP server listing created: ${result.listing.slug}`, opts);
            printDetail(result.listing, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Update MCP server listing ──────────────────────────────────
    mcp
        .command("update <slug>")
        .description("Update an MCP server listing")
        .option("--title <title>", "MCP server title")
        .option("--description <text>", "MCP server description")
        .option("--price <sats>", "Price in sats")
        .option("--category <cat>", "Category")
        .option("--tags <tags>", "Comma-separated tags")
        .option("--tagline <text>", "Short tagline")
        .option("--status <status>", "Status: draft|active")
        .option("--server-url <url>", "MCP server URL")
        .option("--source-url <url>", "Source code URL")
        .option("--transport <type>", "Transport type (e.g. stdio, sse, streamable-http)")
        .option("--tools <tools>", "Comma-separated list of supported tools")
        .action(async (slug, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating MCP server listing...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (cmdOpts.title)
                body.title = cmdOpts.title;
            if (cmdOpts.description)
                body.description = cmdOpts.description;
            if (cmdOpts.price)
                body.price_sats = parseInt(cmdOpts.price, 10);
            if (cmdOpts.category)
                body.category = cmdOpts.category;
            if (cmdOpts.tagline)
                body.tagline = cmdOpts.tagline;
            if (cmdOpts.tags)
                body.tags = cmdOpts.tags.split(",").map((t) => t.trim());
            if (cmdOpts.status)
                body.status = cmdOpts.status;
            if (cmdOpts.serverUrl)
                body.mcp_server_url = cmdOpts.serverUrl;
            if (cmdOpts.sourceUrl)
                body.source_url = cmdOpts.sourceUrl;
            if (cmdOpts.transport)
                body.transport_type = cmdOpts.transport;
            if (cmdOpts.tools)
                body.supported_tools = cmdOpts.tools.split(",").map((t) => t.trim());
            const result = await client.patch(`/api/mcp/${slug}`, body);
            spinner?.stop();
            printSuccess(`MCP server listing updated: ${slug}`, opts);
            printDetail(result.listing, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Delete MCP server listing ──────────────────────────────────
    mcp
        .command("delete <slug>")
        .description("Archive (soft-delete) an MCP server listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Deleting MCP server listing...").start();
        try {
            const client = createClient(opts);
            await client.delete(`/api/mcp/${slug}`);
            spinner?.stop();
            printSuccess(`MCP server listing archived: ${slug}`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── My MCP server listings ────────────────────────────────────
    mcp
        .command("mine")
        .description("List your own MCP server listings")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching your MCP servers...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/mcp/my");
            spinner?.stop();
            printTable([
                { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
                { header: "Title", key: "title", width: 30, transform: truncate(28) },
                { header: "Status", key: "status", width: 10 },
                { header: "Transport", key: "transport_type", width: 12, transform: (v) => v || "—" },
                { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
                { header: "Downloads", key: "downloads_count", width: 10 },
            ], result.listings, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Vote (upvote) ──────────────────────────────────────────────
    mcp
        .command("vote <slug>")
        .description("Upvote an MCP server listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Voting...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/mcp/${slug}/vote`, { vote_type: 1 });
            spinner?.stop();
            printSuccess(`Voted on ${slug} (score: ${result.score})`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Unvote (remove vote) ───────────────────────────────────────
    mcp
        .command("unvote <slug>")
        .description("Remove your vote from an MCP server listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Removing vote...").start();
        try {
            const client = createClient(opts);
            // Sending the same vote_type again toggles it off
            const result = await client.post(`/api/mcp/${slug}/vote`, { vote_type: 1 });
            spinner?.stop();
            printSuccess(`Vote removed from ${slug} (score: ${result.score})`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Purchase ───────────────────────────────────────────────────
    mcp
        .command("purchase <slug>")
        .description("Purchase an MCP server listing")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Purchasing MCP server...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/mcp/${slug}/purchase`, {});
            spinner?.stop();
            printSuccess(`MCP server purchased! (balance: ${result.new_balance} sats)`, opts);
            if (!opts.json) {
                console.log(`  Purchase ID: ${result.purchase_id}`);
                console.log(`  Fee: ${result.fee_sats} sats (${(result.fee_rate * 100).toFixed(1)}%)`);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Library (purchased MCP servers) ────────────────────────────
    mcp
        .command("library")
        .description("List your purchased MCP servers")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching your MCP library...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/mcp/library");
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                const rows = (result.purchases || []).map((p) => ({
                    slug: p.listing?.slug,
                    title: p.listing?.title,
                    price_sats: p.price_sats,
                    purchased_at: p.created_at,
                }));
                printTable([
                    { header: "Slug", key: "slug", width: 25, transform: truncate(23) },
                    { header: "Title", key: "title", width: 30, transform: truncate(28) },
                    { header: "Price", key: "price_sats", width: 10, transform: (v) => `${v} sats` },
                    { header: "Purchased", key: "purchased_at", transform: relativeDate },
                ], rows, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Connect (get server URL + transport) ───────────────────────
    mcp
        .command("connect <slug>")
        .description("Get MCP server connection info (URL + transport type)")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching connection info...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/mcp/${slug}/download`, {});
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log(`\n🔌 ${result.title}`);
                console.log(`   Server URL: ${result.mcp_server_url}`);
                console.log(`   Transport:  ${result.transport_type || "—"}`);
                if (result.supported_tools?.length) {
                    console.log(`   Tools:      ${result.supported_tools.join(", ")}`);
                }
                console.log();
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── List reviews ───────────────────────────────────────────────
    mcp
        .command("reviews <slug>")
        .description("List reviews for an MCP server")
        .action(async (slug) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching reviews...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/mcp/${slug}/reviews`);
            spinner?.stop();
            printTable([
                { header: "User", key: "reviewer", width: 20, transform: (v) => v?.username || "—" },
                { header: "Rating", key: "rating", width: 8, transform: (v) => "★".repeat(Number(v)) },
                { header: "Comment", key: "comment", width: 40, transform: (v) => truncate(38)(v || "—") },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], result.reviews, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Submit review ──────────────────────────────────────────────
    mcp
        .command("review <slug>")
        .description("Submit a review for an MCP server (must have purchased)")
        .requiredOption("--rating <n>", "Rating (1-5)")
        .option("--comment <text>", "Review comment")
        .action(async (slug, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Submitting review...").start();
        try {
            const client = createClient(opts);
            const body = {
                rating: parseInt(cmdOpts.rating, 10),
            };
            if (cmdOpts.comment)
                body.comment = cmdOpts.comment;
            const result = await client.post(`/api/mcp/${slug}/reviews`, body);
            spinner?.stop();
            printSuccess(`Review submitted for ${slug}`, opts);
            printDetail(result.review, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=mcp.js.map