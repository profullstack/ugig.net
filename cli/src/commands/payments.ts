import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printDetail, printSuccess, type OutputOptions } from "../output.js";

export function registerPaymentsCommands(program: Command): void {
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
    .action(
      async (cmdOpts: {
        type: string;
        currency: string;
        plan?: string;
        amount?: string;
        gigId?: string;
      }) => {
        const opts = program.opts() as GlobalOpts;
        const spinner = opts.json ? null : ora("Creating payment...").start();
        try {
          const client = createClient(opts);
          const body: Record<string, unknown> = {
            type: cmdOpts.type,
            currency: cmdOpts.currency,
          };
          if (cmdOpts.plan) body.plan = cmdOpts.plan;
          if (cmdOpts.amount) body.amount_usd = parseFloat(cmdOpts.amount);
          if (cmdOpts.gigId) body.gig_id = cmdOpts.gigId;

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
            opts as OutputOptions,
          );
        } catch (err) {
          spinner?.fail("Failed");
          handleError(err, opts as OutputOptions);
        }
      },
    );

  // ── Check payment status ───────────────────────────────────────

  payments
    .command("status <id>")
    .description("Check payment status")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching payment status...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<Record<string, unknown>>(
          `/api/payments/coinpayportal/${id}`,
        );
        spinner?.stop();
        printDetail(
          [
            { label: "Payment ID", key: "id" },
            { label: "Status", key: "status" },
            { label: "Amount (USD)", key: "amount_usd" },
            { label: "Currency", key: "currency" },
            { label: "Type", key: "type" },
            { label: "Created", key: "created_at" },
          ],
          result,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
