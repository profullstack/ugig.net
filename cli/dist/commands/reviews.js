import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, truncateId, truncate, relativeDate, formatDate } from "../output.js";
export function registerReviewsCommands(program) {
    const reviews = program
        .command("reviews")
        .description("Manage reviews");
    reviews
        .command("list")
        .description("List reviews")
        .option("--gig-id <id>", "Filter by gig ID")
        .option("--limit <n>", "Number of results", parseInt, 20)
        .option("--offset <n>", "Offset", parseInt, 0)
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching reviews...").start();
        try {
            const client = createClient(opts);
            const params = {
                gig_id: options.gigId,
                limit: options.limit,
                offset: options.offset,
            };
            const result = await client.get("/api/reviews", params);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Rating", key: "rating", width: 8, transform: (v) => "★".repeat(Number(v || 0)) },
                { header: "Comment", key: "comment", width: 40, transform: truncate(38) },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch reviews");
            handleError(err, opts);
        }
    });
    reviews
        .command("get <id>")
        .description("Get a review")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching review...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/reviews/${id}`);
            spinner?.stop();
            printDetail([
                { label: "ID", key: "id" },
                { label: "Rating", key: "rating", transform: (v) => "★".repeat(Number(v || 0)) },
                { label: "Comment", key: "comment" },
                { label: "Gig ID", key: "gig_id" },
                { label: "Reviewer", key: "reviewer_id" },
                { label: "Reviewee", key: "reviewee_id" },
                { label: "Created", key: "created_at", transform: formatDate },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    reviews
        .command("create")
        .description("Create a review")
        .requiredOption("--gig-id <id>", "Gig ID")
        .requiredOption("--reviewee-id <id>", "Reviewee user ID")
        .requiredOption("--rating <n>", "Rating (1-5)", parseInt)
        .option("--comment <text>", "Review comment")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating review...").start();
        try {
            const client = createClient(opts);
            const body = {
                gig_id: options.gigId,
                reviewee_id: options.revieweeId,
                rating: options.rating,
            };
            if (options.comment)
                body.comment = options.comment;
            const result = await client.post("/api/reviews", body);
            spinner?.succeed("Review created");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                printSuccess(`Review created: ${result.data.id}`, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    reviews
        .command("update <id>")
        .description("Update a review")
        .option("--rating <n>", "Rating (1-5)", parseInt)
        .option("--comment <text>", "Comment")
        .action(async (id, options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating review...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (options.rating !== undefined)
                body.rating = options.rating;
            if (options.comment !== undefined)
                body.comment = options.comment;
            await client.put(`/api/reviews/${id}`, body);
            spinner?.succeed("Review updated");
            printSuccess("Review updated.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    reviews
        .command("delete <id>")
        .description("Delete a review")
        .action(async (id) => {
        const opts = program.opts();
        try {
            const client = createClient(opts);
            await client.delete(`/api/reviews/${id}`);
            printSuccess("Review deleted.", opts);
        }
        catch (err) {
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=reviews.js.map