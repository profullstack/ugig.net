import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, relativeDate } from "../output.js";
export function registerReferralsCommands(program) {
    program
        .command("referrals")
        .description("List your referrals")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching referrals...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/referrals");
            spinner?.stop();
            if (!opts.json) {
                const s = result.stats;
                console.log(`  Invited: ${s.total_invited} | Registered: ${s.total_registered} | Conversion: ${s.conversion_rate}%\n`);
            }
            printTable([
                { header: "Email", key: "referred_email", width: 30 },
                { header: "Status", key: "status", width: 12 },
                { header: "Code", key: "referral_code", width: 16 },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    program
        .command("referral-code")
        .description("Get your referral code and link")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching referral code...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/referrals/code");
            spinner?.stop();
            printDetail([
                { label: "Code", key: "code" },
                { label: "Link", key: "link" },
            ], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=referrals.js.map