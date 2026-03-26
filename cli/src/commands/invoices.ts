import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import {
  printTable,
  printDetail,
  printSuccess,
  type OutputOptions,
  relativeDate,
  truncate,
} from "../output.js";

export function registerInvoicesCommands(program: Command): void {
  const invoices = program.command("invoices").description("Gig invoice management");

  // ── List invoices for a gig ────────────────────────────────────

  invoices
    .command("list <gig-id>")
    .description("List invoices for a gig")
    .action(async (gigId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching invoices...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{
          data: Record<string, unknown>[];
        }>(`/api/gigs/${gigId}/invoice`);
        spinner?.stop();
        printTable(
          [
            { header: "ID", key: "id", width: 10, transform: truncate(8) },
            { header: "Amount (USD)", key: "amount_usd", width: 14 },
            { header: "Currency", key: "currency", width: 10 },
            { header: "Status", key: "status", width: 10 },
            { header: "Pay URL", key: "pay_url", width: 30, transform: truncate(28) },
            { header: "Created", key: "created_at", transform: relativeDate },
          ],
          result.data || [],
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
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
    .action(
      async (
        gigId: string,
        cmdOpts: {
          applicationId: string;
          amount: string;
          currency?: string;
          notes?: string;
          dueDate?: string;
        },
      ) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Creating invoice...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {
            application_id: cmdOpts.applicationId,
            amount: parseFloat(cmdOpts.amount),
            currency: cmdOpts.currency || "USD",
          };
          if (cmdOpts.notes) body.notes = cmdOpts.notes;
          if (cmdOpts.dueDate) body.due_date = cmdOpts.dueDate;

          const result = await client.post<{
            data: {
              invoice_id: string;
              coinpay_invoice_id: string;
              pay_url: string;
            };
          }>(`/api/gigs/${gigId}/invoice`, body);
          spinner?.stop();
          printSuccess("Invoice created", opts as OutputOptions);
          printDetail(
            [
              { label: "Invoice ID", key: "invoice_id" },
              { label: "CoinPay Invoice ID", key: "coinpay_invoice_id" },
              { label: "Pay URL", key: "pay_url" },
            ],
            result.data as unknown as Record<string, unknown>,
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );
}
