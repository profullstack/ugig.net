import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, truncateId, truncate, relativeDate } from "../output.js";
export function registerTestimonialsCommands(program) {
    const testimonials = program
        .command("testimonials")
        .description("Manage testimonials (profile & gig)");
    testimonials
        .command("list")
        .description("List testimonials for a profile or gig")
        .option("--profile-id <id>", "Filter by profile ID")
        .option("--gig-id <id>", "Filter by gig ID")
        .option("--limit <n>", "Number of results", (v) => Number(v), 20)
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching testimonials...").start();
        try {
            const client = createClient(opts);
            const params = {};
            if (options.profileId)
                params.profile_id = options.profileId;
            if (options.gigId)
                params.gig_id = options.gigId;
            params.limit = options.limit;
            const result = await client.get("/api/testimonials", params);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Rating", key: "rating", width: 8, transform: (v) => "★".repeat(Number(v || 0)) },
                { header: "Content", key: "content", width: 40, transform: truncate(38) },
                { header: "Author", key: "author", width: 16, transform: (v) => {
                        const a = v;
                        return a?.username || a?.full_name || "unknown";
                    } },
                { header: "Status", key: "status", width: 10 },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], result.testimonials || [], opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch testimonials");
            handleError(err, opts);
        }
    });
    testimonials
        .command("create")
        .description("Leave a testimonial on a profile or gig")
        .option("--profile-id <id>", "Profile ID (for profile testimonials)")
        .option("--gig-id <id>", "Gig ID (for gig testimonials)")
        .requiredOption("--rating <n>", "Rating (1-5)", parseInt)
        .requiredOption("--content <text>", "Testimonial content")
        .action(async (options) => {
        const opts = program.opts();
        if (!options.profileId && !options.gigId) {
            console.error("Error: provide either --profile-id or --gig-id");
            process.exit(1);
        }
        const spinner = opts.json ? null : ora("Posting testimonial...").start();
        try {
            const client = createClient(opts);
            const body = {
                rating: options.rating,
                content: options.content,
            };
            if (options.profileId)
                body.profile_id = options.profileId;
            if (options.gigId)
                body.gig_id = options.gigId;
            const result = await client.post("/api/testimonials", body);
            spinner?.succeed("Testimonial posted (pending approval)");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess(`Testimonial created: ${result.testimonial.id}`, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed to post testimonial");
            handleError(err, opts);
        }
    });
    testimonials
        .command("approve <id>")
        .description("Approve a pending testimonial (owner only)")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Approving...").start();
        try {
            const client = createClient(opts);
            await client.patch(`/api/testimonials/${id}`, { status: "approved" });
            spinner?.succeed("Testimonial approved");
            printSuccess("Testimonial approved and now visible.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    testimonials
        .command("reject <id>")
        .description("Reject a pending testimonial (owner only)")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Rejecting...").start();
        try {
            const client = createClient(opts);
            await client.patch(`/api/testimonials/${id}`, { status: "rejected" });
            spinner?.succeed("Testimonial rejected");
            printSuccess("Testimonial rejected.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    testimonials
        .command("pending")
        .description("List your pending testimonials to review")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching pending testimonials...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/testimonials/manage");
            spinner?.stop();
            const pending = (result.testimonials || []).filter((t) => t.status === "pending");
            if (pending.length === 0) {
                console.log("No pending testimonials.");
                return;
            }
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Rating", key: "rating", width: 8, transform: (v) => "★".repeat(Number(v || 0)) },
                { header: "Content", key: "content", width: 40, transform: truncate(38) },
                { header: "Author", key: "author", width: 16, transform: (v) => {
                        const a = v;
                        return a?.username || a?.full_name || "unknown";
                    } },
                { header: "Type", key: "gig_id", width: 8, transform: (v) => v ? "gig" : "profile" },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], pending, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=testimonials.js.map