import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printDetail, printSuccess } from "../output.js";
export function registerPaymentsCommands(program) {
    const payments = program
        .command("payments")
        .description("CoinPayPortal payment management");
    // ── Create payment ─────────────────────────────────────────────
    payments
        .command("create")
        .description("Create a new crypto payment")
        .requiredOption("--type <type>", "Payment type: subscription|gig_payment|tip")
        .requiredOption("--currency <currency>", "Currency: usdc_pol|usdc_sol|pol|sol|btc|eth|usdc_eth|usdt")
        .option("--plan <plan>", "Subscription plan: monthly|annual")
        .option("--amount <usd>", "Amount in USD (required for gig_payment and tip)")
        .option("--gig-id <id>", "Gig ID (required for gig_payment)")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating payment...").start();
        try {
            const client = createClient(opts);
            const body = {
                type: cmdOpts.type,
                currency: cmdOpts.currency,
            };
            if (cmdOpts.plan)
                body.plan = cmdOpts.plan;
            if (cmdOpts.amount)
                body.amount_usd = parseFloat(cmdOpts.amount);
            if (cmdOpts.gigId)
                body.gig_id = cmdOpts.gigId;
            const result = await client.post("/api/payments/coinpayportal/create", body);
            spinner?.stop();
            printSuccess("Payment created", opts);
            printDetail([
                { label: "Payment ID", key: "payment_id" },
                { label: "Checkout URL", key: "checkout_url" },
                { label: "Address", key: "address" },
                { label: "Amount (crypto)", key: "amount_crypto" },
                { label: "Currency", key: "currency" },
                { label: "Expires", key: "expires_at" },
            ], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Check payment status ───────────────────────────────────────
    payments
        .command("status <id>")
        .description("Check payment status")
        .action(async (id) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching payment status...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/payments/coinpayportal/${id}`);
            spinner?.stop();
            printDetail([
                { label: "Payment ID", key: "id" },
                { label: "Status", key: "status" },
                { label: "Amount (USD)", key: "amount_usd" },
                { label: "Currency", key: "currency" },
                { label: "Type", key: "type" },
                { label: "Created", key: "created_at" },
            ], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=payments.js.map