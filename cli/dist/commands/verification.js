import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printDetail, printSuccess } from "../output.js";
export function registerVerificationCommands(program) {
    const verification = program.command("verification").description("Verification management");
    verification
        .command("status")
        .description("Check your verification status")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Checking verification status...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/verification/status");
            spinner?.stop();
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }
            printDetail([
                { label: "Verified", key: "verified", transform: (v) => v ? "Yes ✓" : "No" },
                { label: "Verified At", key: "verified_at", transform: (v) => v ? String(v) : "-" },
                { label: "Type", key: "verification_type", transform: (v) => v ? String(v) : "-" },
            ], result, opts);
            if (result.latest_request) {
                console.log("\n  Latest Request:");
                printDetail([
                    { label: "Status", key: "status" },
                    { label: "Evidence", key: "evidence" },
                    { label: "Created", key: "created_at" },
                ], result.latest_request, opts);
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    verification
        .command("request")
        .description("Submit a verification request")
        .requiredOption("--evidence <text>", "Evidence (link to portfolio, GitHub, etc.)")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Submitting verification request...").start();
        try {
            const client = createClient(opts);
            const result = await client.post("/api/verification/request", {
                evidence: cmdOpts.evidence,
            });
            spinner?.stop();
            printSuccess("Verification request submitted.", opts);
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=verification.js.map