import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printDetail, printSuccess, formatDate, colorizeStatus } from "../output.js";
export function registerSubscriptionCommands(program) {
    const sub = program
        .command("subscription")
        .description("Manage your subscription");
    sub
        .command("get")
        .description("View current subscription")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching subscription...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/subscriptions");
            spinner?.stop();
            if (!result.data) {
                printSuccess("No active subscription. You're on the free plan.", opts);
                return;
            }
            printDetail([
                { label: "Plan", key: "plan" },
                { label: "Status", key: "status", transform: (v) => colorizeStatus(v) },
                { label: "Period Start", key: "current_period_start", transform: formatDate },
                { label: "Period End", key: "current_period_end", transform: formatDate },
                { label: "Cancel at End", key: "cancel_at_period_end", transform: (v) => v ? "Yes" : "No" },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    sub
        .command("cancel")
        .description("Cancel your subscription")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Cancelling...").start();
        try {
            const client = createClient(opts);
            await client.delete("/api/subscriptions");
            spinner?.succeed("Subscription cancelled");
            printSuccess("Subscription will cancel at end of billing period.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    sub
        .command("reactivate")
        .description("Reactivate a cancelled subscription")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Reactivating...").start();
        try {
            const client = createClient(opts);
            await client.put("/api/subscriptions");
            spinner?.succeed("Subscription reactivated");
            printSuccess("Subscription reactivated.", opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=subscriptions.js.map