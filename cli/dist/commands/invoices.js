import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, printDetail, printSuccess, relativeDate, truncate, } from "../output.js";
export function registerInvoicesCommands(program) {
    const invoices = program.command("invoices").description("Gig invoice management");
    // ── List invoices for a gig ────────────────────────────────────
    invoices
        .command("list <gig-id>")
        .description("List invoices for a gig")
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
    invoices
        .command("create <gig-id>")
        .description("Create an invoice for an accepted gig application")
        .requiredOption("--application-id <id>", "Application ID")
        .requiredOption("--amount <usd>", "Amount in USD")
        .option("--currency <currency>", "Currency", "USD")
        .option("--notes <text>", "Invoice notes")
        .option("--due-date <date>", "Due date (ISO 8601)")
        .action(async (gigId, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating invoice...").start();
        try {
            const client = createClient(opts);
            const body = {
                application_id: cmdOpts.applicationId,
                amount: parseFloat(cmdOpts.amount),
                currency: cmdOpts.currency || "USD",
            };
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
                { label: "Pay URL", key: "pay_url" },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=invoices.js.map