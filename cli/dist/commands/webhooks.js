import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, relativeDate, formatArray } from "../output.js";
/** The /api/v1/webhooks API (@profullstack/webhooks). */
const API = "/api/v1/webhooks";
const EVENTS = "application.new, message.new, gig.update, review.new";
const splitEvents = (s) => s.split(",").map((e) => e.trim()).filter(Boolean);
export function registerWebhooksCommands(program) {
    const webhooks = program
        .command("webhooks")
        .alias("webhook")
        .description("Manage webhook endpoints (signed CloudEvents, retried for ~3 days)");
    /** Run one API call with a spinner, JSON output under --json, and the shared error handler. */
    const action = (label, fn) => async (...args) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora(label).start();
        try {
            const client = createClient(opts);
            spinner?.stop();
            await fn(client, opts, ...args);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    };
    const json = (opts, value) => {
        if (opts.json) {
            console.log(JSON.stringify(value, null, 2));
            return true;
        }
        return false;
    };
    webhooks
        .command("list")
        .description("List your webhook endpoints")
        .action(action("Fetching webhooks...", async (client, opts) => {
        const result = await client.get(API);
        if (json(opts, result))
            return;
        printTable([
            { header: "ID", key: "id", width: 30 },
            { header: "URL", key: "url", width: 40 },
            { header: "Events", key: "events", width: 30, transform: formatArray },
            { header: "Enabled", key: "enabled", width: 8, transform: (v) => (v ? "Yes" : "No") },
            { header: "Created", key: "created_at", transform: relativeDate },
        ], result.endpoints, opts);
    }));
    webhooks
        .command("create")
        .alias("add")
        .description("Create a webhook endpoint; prints its signing secret")
        .requiredOption("--url <url>", "Webhook URL (public https)")
        .option("--events <events>", `Comma-separated events or patterns (${EVENTS}, gig.*, *)`, "*")
        .option("--description <text>", "A note for yourself")
        .option("--inactive", "Create it paused")
        .action(action("Creating webhook...", async (client, opts, cmdOpts) => {
        const result = await client.post(API, {
            url: cmdOpts.url,
            events: splitEvents(cmdOpts.events),
            ...(cmdOpts.description ? { description: cmdOpts.description } : {}),
        });
        if (cmdOpts.inactive)
            result.endpoint = await client.patch(`${API}/${result.endpoint.id}`, { enabled: false });
        if (json(opts, result))
            return;
        printSuccess(`Webhook created: ${result.endpoint.id}`, opts);
        console.log(`  Secret: ${result.secret}`);
        console.log("  Verify the webhook-signature header (Standard Webhooks) or X-Webhook-Signature (hex HMAC-SHA256 of the body).");
    }));
    webhooks
        .command("get <id>")
        .description("Show one webhook endpoint")
        .action(action("Fetching webhook...", async (client, opts, id) => {
        const endpoint = await client.get(`${API}/${encodeURIComponent(id)}`);
        if (json(opts, endpoint))
            return;
        for (const [k, v] of Object.entries(endpoint))
            console.log(`  ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
    }));
    webhooks
        .command("update <id>")
        .description("Change a webhook endpoint")
        .option("--url <url>", "New URL")
        .option("--events <events>", "Comma-separated events or patterns")
        .option("--description <text>", "New description")
        .option("--active", "Enable it (also clears its failure count)")
        .option("--inactive", "Pause it")
        .action(action("Updating webhook...", async (client, opts, id, cmdOpts) => {
        const body = {};
        if (cmdOpts.url)
            body.url = cmdOpts.url;
        if (cmdOpts.events)
            body.events = splitEvents(cmdOpts.events);
        if (cmdOpts.description !== undefined)
            body.description = cmdOpts.description;
        if (cmdOpts.active)
            body.enabled = true;
        if (cmdOpts.inactive)
            body.enabled = false;
        const endpoint = await client.patch(`${API}/${encodeURIComponent(id)}`, body);
        if (json(opts, endpoint))
            return;
        printSuccess(`Webhook ${id} updated.`, opts);
    }));
    webhooks
        .command("delete <id>")
        .alias("rm")
        .description("Delete a webhook endpoint")
        .action(action("Deleting webhook...", async (client, opts, id) => {
        const result = await client.delete(`${API}/${encodeURIComponent(id)}`);
        if (json(opts, result))
            return;
        printSuccess(`Webhook ${id} deleted.`, opts);
    }));
    webhooks
        .command("test <id>")
        .description("Send a webhook.test event now and show the result")
        .action(action("Sending test...", async (client, opts, id) => {
        const r = await client.post(`${API}/${encodeURIComponent(id)}/test`);
        if (json(opts, r))
            return;
        if (r.ok)
            printSuccess(`Delivered (HTTP ${r.status}).`, opts);
        else
            console.log(`Failed: ${r.error || `HTTP ${r.status}`}`);
    }));
    webhooks
        .command("secret <id>")
        .description("Show an endpoint's signing secret")
        .action(action("Fetching secret...", async (client, opts, id) => {
        const r = await client.get(`${API}/${encodeURIComponent(id)}/secret`);
        if (json(opts, r))
            return;
        console.log(r.secret);
    }));
    webhooks
        .command("rotate <id>")
        .description("Replace an endpoint's signing secret (the old one stops working at once)")
        .action(action("Rotating secret...", async (client, opts, id) => {
        const r = await client.post(`${API}/${encodeURIComponent(id)}/rotate`);
        if (json(opts, r))
            return;
        printSuccess("Secret rotated.", opts);
        console.log(`  Secret: ${r.secret}`);
    }));
    webhooks
        .command("deliveries [id]")
        .description("Recent deliveries (for one endpoint, or all)")
        .option("--limit <n>", "How many", "20")
        .action(action("Fetching deliveries...", async (client, opts, id, cmdOpts) => {
        const path = id ? `${API}/${encodeURIComponent(id)}/deliveries` : `${API}/deliveries`;
        const result = await client.get(path, { limit: cmdOpts.limit });
        if (json(opts, result))
            return;
        printTable([
            { header: "ID", key: "id", width: 24 },
            { header: "Event", key: "event_type", width: 18 },
            { header: "Status", key: "status", width: 10 },
            { header: "HTTP", key: "last_status", width: 6, transform: (v) => (v == null ? "-" : String(v)) },
            { header: "Tries", key: "attempts", width: 6 },
            { header: "Created", key: "created_at", transform: relativeDate },
        ], result.deliveries, opts);
    }));
    webhooks
        .command("retry <deliveryId>")
        .description("Send one delivery again")
        .action(action("Queueing...", async (client, opts, deliveryId) => {
        const r = await client.post(`${API}/deliveries/${encodeURIComponent(deliveryId)}/retry`);
        if (json(opts, r))
            return;
        printSuccess(`Delivery ${deliveryId} queued again.`, opts);
    }));
}
//# sourceMappingURL=webhooks.js.map