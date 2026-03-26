import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, relativeDate, formatArray } from "../output.js";
export function registerWebhooksCommands(program) {
    const webhooks = program.command("webhooks").description("Manage webhooks");
    webhooks
        .command("list")
        .description("List your webhooks")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching webhooks...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/webhooks");
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 10, transform: (v) => String(v).slice(0, 8) },
                { header: "URL", key: "url", width: 40 },
                { header: "Events", key: "events", width: 30, transform: formatArray },
                { header: "Active", key: "active", width: 8, transform: (v) => v ? "Yes" : "No" },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    webhooks
        .command("create")
        .description("Create a webhook")
        .requiredOption("--url <url>", "Webhook URL")
        .requiredOption("--events <events>", "Comma-separated events (application.new,message.new,gig.update,review.new)")
        .option("--inactive", "Create as inactive")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating webhook...").start();
        try {
            const client = createClient(opts);
            const events = cmdOpts.events.split(",").map((e) => e.trim());
            const result = await client.post("/api/webhooks", {
                url: cmdOpts.url,
                events,
                active: !cmdOpts.inactive,
            });
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                const wh = result.data;
                printSuccess(`Webhook created: ${wh.id}`, opts);
                console.log(`  Secret: ${wh.secret}`);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    webhooks
        .command("update <id>")
        .description("Update a webhook")
        .option("--url <url>", "New URL")
        .option("--events <events>", "Comma-separated events")
        .option("--active", "Set active")
        .option("--inactive", "Set inactive")
        .action(async (id, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating webhook...").start();
        try {
            const client = createClient(opts);
            const body = {};
            if (cmdOpts.url)
                body.url = cmdOpts.url;
            if (cmdOpts.events)
                body.events = cmdOpts.events.split(",").map((e) => e.trim());
            if (cmdOpts.active)
                body.active = true;
            if (cmdOpts.inactive)
                body.active = false;
            await client.put(`/api/webhooks/${id}`, body);
            spinner?.stop();
            printSuccess(`Webhook ${id} updated.`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    webhooks
        .command("delete <id>")
        .description("Delete a webhook")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Deleting webhook...").start();
        try {
            const client = createClient(opts);
            await client.delete(`/api/webhooks/${id}`);
            spinner?.stop();
            printSuccess(`Webhook ${id} deleted.`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=webhooks.js.map