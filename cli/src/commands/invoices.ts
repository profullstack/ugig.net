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

  // ── List all user invoices (no gig-id) ────────────────────────

  invoices
    .command("all")
    .description("List all your invoices (sent and/or received)")
    .option("--role <role>", "Filter: sent | received | all", "all")
    .action(async (cmdOpts: { role: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching invoices...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ data: Record<string, unknown>[] }>(
          "/api/invoices",
          { role: cmdOpts.role }
        );
        spinner?.stop();
        printTable(
          [
            { header: "ID",          key: "id",         width: 10, transform: truncate(8) },
            { header: "Gig",         key: "gig_id",     width: 10, transform: truncate(8) },
            { header: "Amount (USD)", key: "amount_usd", width: 13 },
            { header: "Currency",    key: "currency",   width: 10 },
            { header: "Status",      key: "status",     width: 10 },
            { header: "Created",     key: "created_at", transform: relativeDate },
          ],
          result.data || [],
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── List invoices for a gig ────────────────────────────────────

  invoices
    .command("list <gig-id>")
    .description("List invoices for a specific gig")
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
            { header: "ID",          key: "id",         width: 10, transform: truncate(8) },
            { header: "Amount (USD)", key: "amount_usd", width: 14 },
            { header: "Currency",    key: "currency",   width: 10 },
            { header: "Status",      key: "status",     width: 10 },
            { header: "Pay URL",     key: "pay_url",    width: 30, transform: truncate(28) },
            { header: "Created",     key: "created_at", transform: relativeDate },
          ],
          result.data || [],
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Create invoice ─────────────────────────────────────────────
  // Worker must have CoinPay connected + global wallet addresses set up.
  // Use `ugig coinpay wallets` to see available currencies and addresses.

  invoices
    .command("create <gig-id>")
    .description("Create an invoice for an accepted gig application (worker pays out via CoinPay)")
    .requiredOption("--application-id <id>", "Application ID")
    .option(
      "--amount <usd>",
      "Total amount in the gig's native unit (USD or sats). Optional when --item is used."
    )
    .option(
      "--item <spec>",
      'Line item as "description|qty|unit_price[|link]" (repeatable). ' +
        'Link is an optional GitHub PR or PR-search URL, e.g. ' +
        '"Pull requests|8|1|https://github.com/org/repo/pulls?q=is:pr+is:merged+author:you"',
      (value: string, previous: string[]) => previous.concat(value),
      [] as string[]
    )
    .option(
      "--pr-links <urls>",
      "Comma-separated GitHub PR links (or a PR search URL) for the merged work this invoice bills"
    )
    .requiredOption(
      "--payment-currency <currency>",
      "CoinPay receiving currency (e.g. usdc_pol, btc, eth). Run `ugig coinpay wallets` to see options."
    )
    .requiredOption(
      "--wallet-address <address>",
      "Your CoinPay global wallet address for the chosen currency"
    )
    .option("--currency <currency>", "Invoice currency", "USD")
    .option("--notes <text>", "Invoice notes")
    .option("--due-date <date>", "Due date (ISO 8601)")
    .action(
      async (
        gigId: string,
        cmdOpts: {
          applicationId: string;
          amount?: string;
          item: string[];
          prLinks?: string;
          paymentCurrency: string;
          walletAddress: string;
          currency?: string;
          notes?: string;
          dueDate?: string;
        }
      ) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Creating invoice...").start();
        try {
          const items = cmdOpts.item.map((spec) => {
            const [description = "", qty = "1", unitPrice = "", link = ""] = spec.split("|");
            const item: Record<string, unknown> = {
              description: description.trim(),
              quantity: parseFloat(qty) || 1,
              unit_price: parseFloat(unitPrice),
            };
            if (link.trim()) item.link = link.trim();
            if (!Number.isFinite(item.unit_price as number) || (item.unit_price as number) <= 0) {
              throw new Error(
                `Invalid --item "${spec}" — expected "description|qty|unit_price[|link]" with a positive unit price`
              );
            }
            return item;
          });
          if (!cmdOpts.amount && items.length === 0) {
            throw new Error("Provide --amount or at least one --item");
          }

          const client = createClient(opts);
          const body: Record<string, unknown> = {
            application_id: cmdOpts.applicationId,
            currency: cmdOpts.currency || "USD",
            payment_currency: cmdOpts.paymentCurrency,
            merchant_wallet_address: cmdOpts.walletAddress,
          };
          if (cmdOpts.amount) body.amount = parseFloat(cmdOpts.amount);
          if (items.length > 0) body.items = items;
          if (cmdOpts.prLinks) {
            const prLinks = cmdOpts.prLinks
              .split(",")
              .map((u) => u.trim())
              .filter(Boolean);
            if (prLinks.length > 0) body.pr_links = prLinks;
          }
          if (cmdOpts.notes) body.notes = cmdOpts.notes;
          if (cmdOpts.dueDate) body.due_date = cmdOpts.dueDate;

          const result = await client.post<{
            data: {
              invoice_id: string;
              coinpay_invoice_id: string | null;
              pay_url: string | null;
              payment_address: string | null;
              amount_crypto: string | number | null;
              payment_currency: string;
              expires_at: string | null;
            };
          }>(`/api/gigs/${gigId}/invoice`, body);
          spinner?.stop();
          printSuccess("Invoice created", opts as OutputOptions);
          printDetail(
            [
              { label: "Invoice ID",          key: "invoice_id" },
              { label: "CoinPay Invoice ID",  key: "coinpay_invoice_id" },
              { label: "Payment Currency",    key: "payment_currency" },
              { label: "Payment Address",     key: "payment_address" },
              { label: "Amount (crypto)",     key: "amount_crypto" },
              { label: "Pay URL",             key: "pay_url" },
              { label: "Expires",             key: "expires_at" },
            ],
            result.data as unknown as Record<string, unknown>,
            opts as OutputOptions
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      }
    );

  // ── Initiate payment (poster pays invoice via CoinPay) ─────────

  invoices
    .command("pay <gig-id> <invoice-id>")
    .description("Initiate a CoinPay payment request for an invoice (poster action)")
    .action(async (gigId: string, invoiceId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating payment request...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{
          data: {
            invoice_id: string;
            coinpay_invoice_id: string;
            payment_address: string;
            amount_crypto: string | number | null;
            payment_currency: string;
            expires_at: string | null;
          };
        }>(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-request`, {});
        spinner?.stop();
        printSuccess("Payment request created — send crypto to the address below", opts as OutputOptions);
        printDetail(
          [
            { label: "Invoice ID",         key: "invoice_id" },
            { label: "CoinPay Payment ID", key: "coinpay_invoice_id" },
            { label: "Payment Currency",   key: "payment_currency" },
            { label: "Send to Address",    key: "payment_address" },
            { label: "Amount (crypto)",    key: "amount_crypto" },
            { label: "Expires",            key: "expires_at" },
          ],
          result.data as unknown as Record<string, unknown>,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Check payment status ───────────────────────────────────────

  invoices
    .command("payment-status <gig-id> <invoice-id>")
    .description("Check the payment status of an invoice")
    .option("--poll", "Poll every 10 seconds until paid or expired")
    .action(async (gigId: string, invoiceId: string, cmdOpts: { poll?: boolean }) => {
      const opts = program.opts() as GlobalOpts;

      async function checkOnce() {
        const client = createClient(opts);
        const result = await client.get<{
          data: {
            invoice_id: string;
            status: string;
            coinpay_invoice_id: string | null;
            metadata: Record<string, unknown>;
            updated_at: string | null;
          };
        }>(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-status`);
        return (result as any).data ?? result;
      }

      if (!cmdOpts.poll) {
        const spinner = opts.json ? null : ora("Fetching payment status...").start();
        try {
          const data = await checkOnce();
          spinner?.stop();
          printDetail(
            [
              { label: "Invoice ID",         key: "invoice_id" },
              { label: "Status",             key: "status" },
              { label: "CoinPay Payment ID", key: "coinpay_invoice_id" },
              { label: "Updated",            key: "updated_at" },
            ],
            data as Record<string, unknown>,
            opts as OutputOptions
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
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
          const status: string = (data as any).status;
          if (!opts.json) {
            process.stdout.write(`\r  Status: ${status}  `);
          } else {
            console.log(JSON.stringify(data));
          }
          if (status === "paid" || status === "expired" || status === "rejected") {
            done = true;
            if (!opts.json) {
              console.log();
              printDetail(
                [
                  { label: "Invoice ID", key: "invoice_id" },
                  { label: "Status",     key: "status" },
                  { label: "Updated",    key: "updated_at" },
                ],
                data as Record<string, unknown>,
                opts as OutputOptions
              );
            }
          } else {
            await new Promise((r) => setTimeout(r, 10_000));
          }
        } catch (err) {
          console.log();
          handleError(err, opts as OutputOptions);
          done = true;
        }
      }
    });

  // ── Reject invoice ─────────────────────────────────────────────

  invoices
    .command("reject <gig-id> <invoice-id>")
    .description("Reject an invoice (poster action — marks invoice as rejected)")
    .action(async (gigId: string, invoiceId: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Rejecting invoice...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{
          data: { invoice_id: string; status: string };
        }>(`/api/gigs/${gigId}/invoice/${invoiceId}/reject`, {});
        spinner?.stop();
        const data = (result as any).data ?? result;
        printSuccess(`Invoice ${data.invoice_id} rejected`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
