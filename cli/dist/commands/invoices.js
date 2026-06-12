import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, relativeDate, truncate, } from "../output.js";
export function registerInvoicesCommands(program) {
    const invoices = program.command("invoices").description("Gig invoice management");
    // ── List all user invoices (no gig-id) ────────────────────────
    invoices
        .command("all")
        .description("List all your invoices (sent and/or received)")
        .option("--role <role>", "Filter: sent | received | all", "all")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching invoices...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/invoices", { role: cmdOpts.role });
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 10, transform: truncate(8) },
                { header: "Gig", key: "gig_id", width: 10, transform: truncate(8) },
                { header: "Amount (USD)", key: "amount_usd", width: 13 },
                { header: "Currency", key: "currency", width: 10 },
                { header: "Status", key: "status", width: 10 },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.data || [], opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── List invoices for a gig ────────────────────────────────────
    invoices
        .command("list <gig-id>")
        .description("List invoices for a specific gig")
        .action(async (gigId) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching invoices...").start();
        try {
            const client = createClient(opts);
            const result = await client.get(`/api/gigs/${gigId}/invoice`);
            spinner?.stop();
            printTable([
                { header: "ID", key: "id", width: 10, transform: truncate(8) },
                { header: "Amount (USD)", key: "amount_usd", width: 14 },
                { header: "Currency", key: "currency", width: 10 },
                { header: "Status", key: "status", width: 10 },
                { header: "Pay URL", key: "pay_url", width: 30, transform: truncate(28) },
                { header: "Created", key: "created_at", transform: relativeDate },
            ], result.data || [], opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Create invoice ─────────────────────────────────────────────
    // Worker must have CoinPay connected + global wallet addresses set up.
    // Use `ugig coinpay wallets` to see available currencies and addresses.
    invoices
        .command("create <gig-id>")
        .description("Create an invoice for an accepted gig application (worker pays out via CoinPay)")
        .requiredOption("--application-id <id>", "Application ID")
        .option("--amount <usd>", "Total amount in the gig's native unit (USD or sats). Optional when --item is used.")
        .option("--item <spec>", 'Line item as "description|qty|unit_price[|link]" (repeatable). ' +
        'Link is an optional GitHub PR or PR-search URL, e.g. ' +
        '"Pull requests|8|1|https://github.com/org/repo/pulls?q=is:pr+is:merged+author:you"', (value, previous) => previous.concat(value), [])
        .option("--pr-links <urls>", "Comma-separated GitHub PR links (or a PR search URL) for the merged work this invoice bills")
        .requiredOption("--payment-currency <currency>", "CoinPay receiving currency (e.g. usdc_pol, btc, eth). Run `ugig coinpay wallets` to see options.")
        .requiredOption("--wallet-address <address>", "Your CoinPay global wallet address for the chosen currency")
        .option("--currency <currency>", "Invoice currency", "USD")
        .option("--notes <text>", "Invoice notes")
        .option("--due-date <date>", "Due date (ISO 8601)")
        .action(async (gigId, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating invoice...").start();
        try {
            const items = cmdOpts.item.map((spec) => {
                const [description = "", qty = "1", unitPrice = "", link = ""] = spec.split("|");
                const item = {
                    description: description.trim(),
                    quantity: parseFloat(qty) || 1,
                    unit_price: parseFloat(unitPrice),
                };
                if (link.trim())
                    item.link = link.trim();
                if (!Number.isFinite(item.unit_price) || item.unit_price <= 0) {
                    throw new Error(`Invalid --item "${spec}" — expected "description|qty|unit_price[|link]" with a positive unit price`);
                }
                return item;
            });
            if (!cmdOpts.amount && items.length === 0) {
                throw new Error("Provide --amount or at least one --item");
            }
            const client = createClient(opts);
            const body = {
                application_id: cmdOpts.applicationId,
                currency: cmdOpts.currency || "USD",
                payment_currency: cmdOpts.paymentCurrency,
                merchant_wallet_address: cmdOpts.walletAddress,
            };
            if (cmdOpts.amount)
                body.amount = parseFloat(cmdOpts.amount);
            if (items.length > 0)
                body.items = items;
            if (cmdOpts.prLinks) {
                const prLinks = cmdOpts.prLinks
                    .split(",")
                    .map((u) => u.trim())
                    .filter(Boolean);
                if (prLinks.length > 0)
                    body.pr_links = prLinks;
            }
            if (cmdOpts.notes)
                body.notes = cmdOpts.notes;
            if (cmdOpts.dueDate)
                body.due_date = cmdOpts.dueDate;
            const result = await client.post(`/api/gigs/${gigId}/invoice`, body);
            spinner?.stop();
            printSuccess("Invoice created", opts);
            printDetail([
                { label: "Invoice ID", key: "invoice_id" },
                { label: "CoinPay Invoice ID", key: "coinpay_invoice_id" },
                { label: "Payment Currency", key: "payment_currency" },
                { label: "Payment Address", key: "payment_address" },
                { label: "Amount (crypto)", key: "amount_crypto" },
                { label: "Pay URL", key: "pay_url" },
                { label: "Expires", key: "expires_at" },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Initiate payment (poster pays invoice via CoinPay) ─────────
    invoices
        .command("pay <gig-id> <invoice-id>")
        .description("Initiate a CoinPay payment request for an invoice (poster action)")
        .action(async (gigId, invoiceId) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating payment request...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-request`, {});
            spinner?.stop();
            printSuccess("Payment request created — send crypto to the address below", opts);
            printDetail([
                { label: "Invoice ID", key: "invoice_id" },
                { label: "CoinPay Payment ID", key: "coinpay_invoice_id" },
                { label: "Payment Currency", key: "payment_currency" },
                { label: "Send to Address", key: "payment_address" },
                { label: "Amount (crypto)", key: "amount_crypto" },
                { label: "Expires", key: "expires_at" },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ── Check payment status ───────────────────────────────────────
    invoices
        .command("payment-status <gig-id> <invoice-id>")
        .description("Check the payment status of an invoice")
        .option("--poll", "Poll every 10 seconds until paid or expired")
        .action(async (gigId, invoiceId, cmdOpts) => {
        const opts = program.opts();
        async function checkOnce() {
            const client = createClient(opts);
            const result = await client.get(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-status`);
            return result.data ?? result;
        }
        if (!cmdOpts.poll) {
            const spinner = opts.json ? null : ora("Fetching payment status...").start();
            try {
                const data = await checkOnce();
                spinner?.stop();
                printDetail([
                    { label: "Invoice ID", key: "invoice_id" },
                    { label: "Status", key: "status" },
                    { label: "CoinPay Payment ID", key: "coinpay_invoice_id" },
                    { label: "Updated", key: "updated_at" },
                ], data, opts);
            }
            catch (err) {
                spinner?.fail("Failed");
                handleError(err, opts);
            }
            return;
        }
        // Polling mode
        if (!opts.json) {
            console.log("Polling for payment (Ctrl+C to stop)…");
        }
        let done = false;
        while (!done) {
            try {
                const data = await checkOnce();
                const status = data.status;
                if (!opts.json) {
                    process.stdout.write(`\r  Status: ${status}  `);
                }
                else {
                    console.log(JSON.stringify(data));
                }
                if (status === "paid" || status === "expired" || status === "rejected") {
                    done = true;
                    if (!opts.json) {
                        console.log();
                        printDetail([
                            { label: "Invoice ID", key: "invoice_id" },
                            { label: "Status", key: "status" },
                            { label: "Updated", key: "updated_at" },
                        ], data, opts);
                    }
                }
                else {
                    await new Promise((r) => setTimeout(r, 10_000));
                }
            }
            catch (err) {
                console.log();
                handleError(err, opts);
                done = true;
            }
        }
    });
    // ── Reject invoice ─────────────────────────────────────────────
    invoices
        .command("reject <gig-id> <invoice-id>")
        .description("Reject an invoice (poster action — marks invoice as rejected)")
        .action(async (gigId, invoiceId) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Rejecting invoice...").start();
        try {
            const client = createClient(opts);
            const result = await client.post(`/api/gigs/${gigId}/invoice/${invoiceId}/reject`, {});
            spinner?.stop();
            const data = result.data ?? result;
            printSuccess(`Invoice ${data.invoice_id} rejected`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=invoices.js.map