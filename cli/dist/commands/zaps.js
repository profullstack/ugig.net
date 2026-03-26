import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printSuccess, printDetail } from "../output.js";
export function registerZapsCommands(program) {
    program
        .command("zap <username> <amount>")
        .description("Zap sats to a user")
        .option("--target-type <type>", "Target type (post, gig, comment, profile)", "profile")
        .option("--target-id <id>", "Target ID")
        .option("--note <text>", "Optional note")
        .action(async (username, amount, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Sending zap...").start();
        try {
            const client = createClient(opts);
            const cleanUsername = username.replace(/^@/, "");
            const profile = await client.get(`/api/users/${encodeURIComponent(cleanUsername)}`);
            const recipientId = profile.profile.id;
            const result = await client.post("/api/wallet/zap", {
                recipient_id: recipientId,
                amount_sats: parseInt(amount, 10),
                target_type: cmdOpts.targetType,
                target_id: cmdOpts.targetId || recipientId,
                note: cmdOpts.note,
            });
            spinner?.stop();
            printSuccess(`Zapped ${amount} sats to @${cleanUsername} (fee: ${result.fee_sats} sats). New balance: ${result.new_balance} sats.`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    program
        .command("zap-stats <user-id>")
        .description("Get zap stats for a user")
        .action(async (userId) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching zap stats...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/zaps/stats", { user_id: userId });
            spinner?.stop();
            printDetail([
                { label: "Total Sats Received", key: "total_sats_received" },
                { label: "Zap Count", key: "zap_count" },
            ], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=zaps.js.map