import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printDetail, printSuccess, type OutputOptions } from "../output.js";

export function registerPaymentsCommands(program: Command): void {
  const payments = program.command("payments").description("CoinPayPortal payment management");

  // ── Create payment ─────────────────────────────────────────────

  payments
    .command("create")
    .description("Create a new crypto payment")
    .requiredOption("--type <type>", "Payment type: subscription|tip")
    .requiredOption(
      "--currency <currency>",
      "Currency: usdc_pol|usdc_sol|pol|sol|btc|eth|usdc_eth|usdt"
    )
    .option(
      "--plan <plan>",
      "Subscription plan: monthly ($9/mo) | annual ($90/yr) | lifetime ($100 one-time)"
    )
    .option("--amount <usd>", "Amount in USD (required for tip)")
    .action(async (cmdOpts: { type: string; currency: string; plan?: string; amount?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating payment...").start();
      try {
        if (cmdOpts.type === "gig_payment") {
          throw new Error(
            "Gig payments must be paid through invoices. Use `ugig invoices create`."
          );
        }

        const client = createClient(opts);
        const body: Record<string, unknown> = {
          type: cmdOpts.type,
          currency: cmdOpts.currency,
        };
        if (cmdOpts.plan) body.plan = cmdOpts.plan;
        if (cmdOpts.amount) body.amount_usd = parseFloat(cmdOpts.amount);

        const result = await client.post<{
          payment_id: string;
          checkout_url: string;
          address: string;
          amount_crypto: number;
          currency: string;
          expires_at: string;
        }>("/api/payments/coinpayportal/create", body);
        spinner?.stop();
        printSuccess("Payment created", opts as OutputOptions);
        printDetail(
          [
            { label: "Payment ID", key: "payment_id" },
            { label: "Checkout URL", key: "checkout_url" },
            { label: "Address", key: "address" },
            { label: "Amount (crypto)", key: "amount_crypto" },
            { label: "Currency", key: "currency" },
            { label: "Expires", key: "expires_at" },
          ],
          result as unknown as Record<string, unknown>,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ── Check payment status ───────────────────────────────────────

  payments
    .command("status <id>")
    .description("Check payment status (id = Payment ID from `payments create`)")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching payment status...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<Record<string, unknown>>(
          "/api/payments/coinpayportal/status",
          { payment_id: id }
        );
        spinner?.stop();
        printDetail(
          [
            { label: "Payment ID", key: "id" },
            { label: "Status", key: "status" },
            { label: "Provider status", key: "provider_status" },
            { label: "Tx hash", key: "tx_hash" },
            { label: "Updated", key: "updated_at" },
          ],
          { id, ...result },
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
