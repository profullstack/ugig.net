import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printSuccess, type OutputOptions, relativeDate, formatArray } from "../output.js";

/** The /api/v1/webhooks API (@profullstack/webhooks). */
const API = "/api/v1/webhooks";
const EVENTS = "application.new, message.new, gig.update, review.new";

type Endpoint = Record<string, unknown> & { id: string };

const splitEvents = (s: string) => s.split(",").map((e) => e.trim()).filter(Boolean);

export function registerWebhooksCommands(program: Command): void {
  const webhooks = program
    .command("webhooks")
    .alias("webhook")
    .description("Manage webhook endpoints (signed CloudEvents, retried for ~3 days)");

  /** Run one API call with a spinner, JSON output under --json, and the shared error handler. */
  const action =
    <A extends unknown[]>(label: string, fn: (client: ReturnType<typeof createClient>, opts: GlobalOpts, ...args: A) => Promise<void>) =>
    async (...args: A) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora(label).start();
      try {
        const client = createClient(opts);
        spinner?.stop();
        await fn(client, opts, ...args);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    };

  const json = (opts: GlobalOpts, value: unknown) => {
    if (opts.json) {
      console.log(JSON.stringify(value, null, 2));
      return true;
    }
    return false;
  };

  webhooks
    .command("list")
    .description("List your webhook endpoints")
    .action(
      action("Fetching webhooks...", async (client, opts) => {
        const result = await client.get<{ endpoints: Endpoint[]; event_types: string[] }>(API);
        if (json(opts, result)) return;
        printTable(
          [
            { header: "ID", key: "id", width: 30 },
            { header: "URL", key: "url", width: 40 },
            { header: "Events", key: "events", width: 30, transform: formatArray },
            { header: "Enabled", key: "enabled", width: 8, transform: (v) => (v ? "Yes" : "No") },
            { header: "Created", key: "created_at", transform: relativeDate },
          ],
          result.endpoints,
          opts as OutputOptions,
        );
      }),
    );

  webhooks
    .command("create")
    .alias("add")
    .description("Create a webhook endpoint; prints its signing secret")
    .requiredOption("--url <url>", "Webhook URL (public https)")
    .option("--events <events>", `Comma-separated events or patterns (${EVENTS}, gig.*, *)`, "*")
    .option("--description <text>", "A note for yourself")
    .option("--inactive", "Create it paused")
    .action(
      action("Creating webhook...", async (client, opts, cmdOpts: { url: string; events: string; description?: string; inactive?: boolean }) => {
        const result = await client.post<{ endpoint: Endpoint; secret: string }>(API, {
          url: cmdOpts.url,
          events: splitEvents(cmdOpts.events),
          ...(cmdOpts.description ? { description: cmdOpts.description } : {}),
        });
        if (cmdOpts.inactive) result.endpoint = await client.patch<Endpoint>(`${API}/${result.endpoint.id}`, { enabled: false });
        if (json(opts, result)) return;
        printSuccess(`Webhook created: ${result.endpoint.id}`, opts as OutputOptions);
        console.log(`  Secret: ${result.secret}`);
        console.log("  Verify the webhook-signature header (Standard Webhooks) or X-Webhook-Signature (hex HMAC-SHA256 of the body).");
      }),
    );

  webhooks
    .command("get <id>")
    .description("Show one webhook endpoint")
    .action(
      action("Fetching webhook...", async (client, opts, id: string) => {
        const endpoint = await client.get<Endpoint>(`${API}/${encodeURIComponent(id)}`);
        if (json(opts, endpoint)) return;
        for (const [k, v] of Object.entries(endpoint)) console.log(`  ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
      }),
    );

  webhooks
    .command("update <id>")
    .description("Change a webhook endpoint")
    .option("--url <url>", "New URL")
    .option("--events <events>", "Comma-separated events or patterns")
    .option("--description <text>", "New description")
    .option("--active", "Enable it (also clears its failure count)")
    .option("--inactive", "Pause it")
    .action(
      action("Updating webhook...", async (client, opts, id: string, cmdOpts: { url?: string; events?: string; description?: string; active?: boolean; inactive?: boolean }) => {
        const body: Record<string, unknown> = {};
        if (cmdOpts.url) body.url = cmdOpts.url;
        if (cmdOpts.events) body.events = splitEvents(cmdOpts.events);
        if (cmdOpts.description !== undefined) body.description = cmdOpts.description;
        if (cmdOpts.active) body.enabled = true;
        if (cmdOpts.inactive) body.enabled = false;
        const endpoint = await client.patch<Endpoint>(`${API}/${encodeURIComponent(id)}`, body);
        if (json(opts, endpoint)) return;
        printSuccess(`Webhook ${id} updated.`, opts as OutputOptions);
      }),
    );

  webhooks
    .command("delete <id>")
    .alias("rm")
    .description("Delete a webhook endpoint")
    .action(
      action("Deleting webhook...", async (client, opts, id: string) => {
        const result = await client.delete(`${API}/${encodeURIComponent(id)}`);
        if (json(opts, result)) return;
        printSuccess(`Webhook ${id} deleted.`, opts as OutputOptions);
      }),
    );

  webhooks
    .command("test <id>")
    .description("Send a webhook.test event now and show the result")
    .action(
      action("Sending test...", async (client, opts, id: string) => {
        const r = await client.post<{ ok: boolean; status: number | null; error: string | null }>(`${API}/${encodeURIComponent(id)}/test`);
        if (json(opts, r)) return;
        if (r.ok) printSuccess(`Delivered (HTTP ${r.status}).`, opts as OutputOptions);
        else console.log(`Failed: ${r.error || `HTTP ${r.status}`}`);
      }),
    );

  webhooks
    .command("secret <id>")
    .description("Show an endpoint's signing secret")
    .action(
      action("Fetching secret...", async (client, opts, id: string) => {
        const r = await client.get<{ secret: string }>(`${API}/${encodeURIComponent(id)}/secret`);
        if (json(opts, r)) return;
        console.log(r.secret);
      }),
    );

  webhooks
    .command("rotate <id>")
    .description("Replace an endpoint's signing secret (the old one stops working at once)")
    .action(
      action("Rotating secret...", async (client, opts, id: string) => {
        const r = await client.post<{ secret: string }>(`${API}/${encodeURIComponent(id)}/rotate`);
        if (json(opts, r)) return;
        printSuccess("Secret rotated.", opts as OutputOptions);
        console.log(`  Secret: ${r.secret}`);
      }),
    );

  webhooks
    .command("deliveries [id]")
    .description("Recent deliveries (for one endpoint, or all)")
    .option("--limit <n>", "How many", "20")
    .action(
      action("Fetching deliveries...", async (client, opts, id: string | undefined, cmdOpts: { limit: string }) => {
        const path = id ? `${API}/${encodeURIComponent(id)}/deliveries` : `${API}/deliveries`;
        const result = await client.get<{ deliveries: Record<string, unknown>[] }>(path, { limit: cmdOpts.limit });
        if (json(opts, result)) return;
        printTable(
          [
            { header: "ID", key: "id", width: 24 },
            { header: "Event", key: "event_type", width: 18 },
            { header: "Status", key: "status", width: 10 },
            { header: "HTTP", key: "last_status", width: 6, transform: (v) => (v == null ? "-" : String(v)) },
            { header: "Tries", key: "attempts", width: 6 },
            { header: "Created", key: "created_at", transform: relativeDate },
          ],
          result.deliveries,
          opts as OutputOptions,
        );
      }),
    );

  webhooks
    .command("retry <deliveryId>")
    .description("Send one delivery again")
    .action(
      action("Queueing...", async (client, opts, deliveryId: string) => {
        const r = await client.post(`${API}/deliveries/${encodeURIComponent(deliveryId)}/retry`);
        if (json(opts, r)) return;
        printSuccess(`Delivery ${deliveryId} queued again.`, opts as OutputOptions);
      }),
    );
}
