import ora from "ora";
import chalk from "chalk";
import { createClient, handleError } from "../helpers.js";
import { printTable, printSuccess, truncateId, formatDate, relativeDate } from "../output.js";
export function registerApiKeysCommands(program) {
    const keys = program
        .command("api-keys")
        .description("Manage API keys");
    keys
        .command("list")
        .description("List your API keys")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching API keys...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/api-keys");
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 12, transform: truncateId },
                { header: "Name", key: "name", width: 25 },
                { header: "Prefix", key: "key_prefix", width: 20 },
                { header: "Created", key: "created_at", transform: relativeDate },
                { header: "Last Used", key: "last_used_at", transform: (v) => v ? relativeDate(v) : "Never" },
                { header: "Expires", key: "expires_at", transform: (v) => v ? formatDate(v) : "Never" },
            ], result.keys, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    keys
        .command("create")
        .description("Create a new API key")
        .requiredOption("--name <name>", "Key name")
        .option("--expires-at <datetime>", "Expiration (ISO 8601)")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating API key...").start();
        try {
            const client = createClient(opts);
            const body = { name: options.name };
            if (options.expiresAt)
                body.expires_at = options.expiresAt;
            const result = await client.post("/api/api-keys", body);
            spinner?.succeed("API key created");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log();
                console.log(chalk.yellow("  ⚠ Save this key now — it won't be shown again:"));
                console.log();
                console.log(chalk.bold(`  ${result.key}`));
                console.log();
                console.log(chalk.dim(`  Name: ${result.name}`));
                console.log(chalk.dim(`  ID:   ${result.id}`));
                console.log();
                console.log(chalk.dim("  Store it with: ugig config set api_key <key>"));
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    keys
        .command("revoke <id>")
        .description("Revoke an API key")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Revoking key...").start();
        try {
            const client = createClient(opts);
            await client.delete(`/api/api-keys/${id}`);
            spinner?.succeed("API key revoked");
            printSuccess("API key revoked.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=api-keys.js.map