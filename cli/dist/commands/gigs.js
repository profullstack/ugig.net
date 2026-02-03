import ora from "ora";
import { createClient, createUnauthClient, handleError, parseList } from "../helpers.js";
import { printTable, printDetail, printSuccess, truncateId, truncate, formatBudget, colorizeStatus, relativeDate, formatDate, formatArray, } from "../output.js";
export function registerGigsCommands(program) {
    const gigs = program
        .command("gigs")
        .description("Browse and manage gigs");
    gigs
        .command("list")
        .description("List active gigs")
        .option("--search <query>", "Search title and description")
        .option("--category <category>", "Filter by category")
        .option("--skills <skills>", "Filter by skills (comma-separated)")
        .option("--budget-type <type>", "Filter: fixed, hourly, per_task, per_unit, revenue_share")
        .option("--budget-min <min>", "Minimum budget", parseFloat)
        .option("--budget-max <max>", "Maximum budget", parseFloat)
        .option("--location-type <type>", "Filter: remote, onsite, hybrid")
        .option("--account-type <type>", "Filter: human or agent")
        .option("--sort <sort>", "Sort: newest, oldest, budget_high, budget_low", "newest")
        .option("--page <n>", "Page number", (v) => Number(v), 1)
        .option("--limit <n>", "Results per page", (v) => Number(v), 20)
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching gigs...").start();
        try {
            const client = createUnauthClient(opts);
            const params = {
                search: options.search,
                category: options.category,
                skills: options.skills,
                budget_type: options.budgetType,
                budget_min: options.budgetMin,
                budget_max: options.budgetMax,
                location_type: options.locationType,
                account_type: options.accountType,
                sort: options.sort,
                page: options.page,
                limit: options.limit,
            };
            const result = await client.get("/api/gigs", params);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Title", key: "title", width: 36, transform: truncate(34) },
                { header: "Budget", key: "budget_type", transform: formatBudget },
                { header: "Location", key: "location_type", width: 10 },
                { header: "Status", key: "status", transform: colorizeStatus },
                { header: "Posted", key: "created_at", transform: relativeDate },
            ], result.gigs, opts, { page: result.pagination.page, total: result.pagination.total, totalPages: result.pagination.totalPages });
        }
        catch (err) {
            spinner?.fail("Failed to fetch gigs");
            handleError(err, opts);
        }
    });
    gigs
        .command("get <id>")
        .description("Get gig details")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching gig...").start();
        try {
            const client = createUnauthClient(opts);
            const result = await client.get(`/api/gigs/${id}`);
            spinner?.stop();
            printDetail([
                { label: "ID", key: "id" },
                { label: "Title", key: "title" },
                { label: "Status", key: "status", transform: (v) => colorizeStatus(v) },
                { label: "Category", key: "category" },
                { label: "Budget Type", key: "budget_type" },
                { label: "Budget Min", key: "budget_min", transform: (v) => v ? `$${v}` : "-" },
                { label: "Budget Max", key: "budget_max", transform: (v) => v ? `$${v}` : "-" },
                { label: "Budget Unit", key: "budget_unit", transform: (v) => v ? String(v) : "-" },
                { label: "Payment Coin", key: "payment_coin", transform: (v) => v ? String(v) : "-" },
                { label: "Location", key: "location_type" },
                { label: "Duration", key: "duration" },
                { label: "Skills", key: "skills_required", transform: formatArray },
                { label: "AI Tools", key: "ai_tools_preferred", transform: formatArray },
                { label: "Applications", key: "applications_count" },
                { label: "Views", key: "views_count" },
                { label: "Created", key: "created_at", transform: formatDate },
                { label: "Description", key: "description" },
            ], result.gig, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch gig");
            handleError(err, opts);
        }
    });
    gigs
        .command("create")
        .description("Create a new gig")
        .requiredOption("--title <title>", "Gig title (10-100 chars)")
        .requiredOption("--description <desc>", "Description (50-5000 chars)")
        .requiredOption("--category <cat>", "Category")
        .requiredOption("--skills <skills>", "Required skills (comma-separated)")
        .option("--ai-tools <tools>", "Preferred AI tools (comma-separated)")
        .requiredOption("--budget-type <type>", "Budget type: fixed, hourly, per_task, per_unit, revenue_share")
        .option("--budget-min <min>", "Minimum budget", parseFloat)
        .option("--budget-max <max>", "Maximum budget", parseFloat)
        .option("--budget-unit <unit>", "Unit label for per_task/per_unit (e.g., post, tweet, image)")
        .option("--payment-coin <coin>", "Payment cryptocurrency (e.g., SOL, ETH, USDC, BTC)")
        .option("--duration <duration>", "Duration")
        .option("--location-type <type>", "Location: remote, onsite, hybrid", "remote")
        .option("--location <location>", "Location details")
        .option("--status <status>", "Status: draft or active", "active")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating gig...").start();
        try {
            const client = createClient(opts);
            const body = {
                title: options.title,
                description: options.description,
                category: options.category,
                skills_required: parseList(options.skills) || [],
                ai_tools_preferred: parseList(options.aiTools) || [],
                budget_type: options.budgetType,
                budget_min: options.budgetMin,
                budget_max: options.budgetMax,
                budget_unit: options.budgetUnit,
                payment_coin: options.paymentCoin,
                duration: options.duration,
                location_type: options.locationType,
                location: options.location,
                status: options.status,
            };
            const result = await client.post("/api/gigs", body);
            spinner?.succeed("Gig created");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess(`Gig created: ${result.gig.id}`, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed to create gig");
            handleError(err, opts);
        }
    });
    gigs
        .command("update <id>")
        .description("Update a gig")
        .option("--title <title>", "Title")
        .option("--description <desc>", "Description")
        .option("--category <cat>", "Category")
        .option("--skills <skills>", "Required skills (comma-separated)")
        .option("--ai-tools <tools>", "AI tools (comma-separated)")
        .option("--budget-type <type>", "Budget type: fixed, hourly, per_task, per_unit, revenue_share")
        .option("--budget-min <min>", "Budget min", parseFloat)
        .option("--budget-max <max>", "Budget max", parseFloat)
        .option("--budget-unit <unit>", "Unit label for per_task/per_unit (e.g., post, tweet, image)")
        .option("--payment-coin <coin>", "Payment cryptocurrency (e.g., SOL, ETH, USDC, BTC)")
        .option("--duration <dur>", "Duration")
        .option("--location-type <type>", "Location type")
        .option("--location <loc>", "Location")
        .action(async (id, options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating gig...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (options.title !== undefined)
                body.title = options.title;
            if (options.description !== undefined)
                body.description = options.description;
            if (options.category !== undefined)
                body.category = options.category;
            if (options.skills !== undefined)
                body.skills_required = parseList(options.skills);
            if (options.aiTools !== undefined)
                body.ai_tools_preferred = parseList(options.aiTools);
            if (options.budgetType !== undefined)
                body.budget_type = options.budgetType;
            if (options.budgetMin !== undefined)
                body.budget_min = options.budgetMin;
            if (options.budgetMax !== undefined)
                body.budget_max = options.budgetMax;
            if (options.budgetUnit !== undefined)
                body.budget_unit = options.budgetUnit;
            if (options.paymentCoin !== undefined)
                body.payment_coin = options.paymentCoin;
            if (options.duration !== undefined)
                body.duration = options.duration;
            if (options.locationType !== undefined)
                body.location_type = options.locationType;
            if (options.location !== undefined)
                body.location = options.location;
            await client.put(`/api/gigs/${id}`, body);
            spinner?.succeed("Gig updated");
            printSuccess("Gig updated successfully.", opts);
        }
        catch (err) {
            spinner?.fail("Failed to update gig");
            handleError(err, opts);
        }
    });
    gigs
        .command("delete <id>")
        .description("Delete a gig")
        .option("--force", "Skip confirmation")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Deleting gig...").start();
        try {
            const client = createClient(opts);
            await client.delete(`/api/gigs/${id}`);
            spinner?.succeed("Gig deleted");
            printSuccess("Gig deleted successfully.", opts);
        }
        catch (err) {
            spinner?.fail("Failed to delete gig");
            handleError(err, opts);
        }
    });
    gigs
        .command("my")
        .description("List your own gigs")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching your gigs...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/gigs/my");
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Title", key: "title", width: 36, transform: truncate(34) },
                { header: "Status", key: "status", transform: colorizeStatus },
                { header: "Apps", key: "applications_count" },
                { header: "Views", key: "views_count" },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.gigs, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch gigs");
            handleError(err, opts);
        }
    });
    gigs
        .command("status <id>")
        .description("Update gig status")
        .requiredOption("--status <status>", "Status: draft, active, paused, closed, filled")
        .action(async (id, options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating status...").start();
        try {
            const client = createClient(opts);
            await client.patch(`/api/gigs/${id}/status`, { status: options.status });
            spinner?.succeed(`Status updated to ${options.status}`);
            printSuccess(`Gig status changed to ${options.status}.`, opts);
        }
        catch (err) {
            spinner?.fail("Failed to update status");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=gigs.js.map