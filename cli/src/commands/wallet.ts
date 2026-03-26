import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printDetail, printTable, printSuccess, type OutputOptions, relativeDate } from "../output.js";

export function registerWalletCommands(program: Command): void {
  const wallet = program.command("wallet").description("Wallet management");

  wallet
    .command("balance")
    .description("Check your wallet balance")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching balance...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ balance_sats: number }>("/api/wallet/balance");
        spinner?.stop();
        printDetail(
          [{ label: "Balance (sats)", key: "balance_sats" }],
          result as unknown as Record<string, unknown>,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  wallet
    .command("transactions")
    .description("List wallet transactions")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page", "20")
    .action(async (cmdOpts: { page: string; limit: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching transactions...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ transactions: Record<string, unknown>[]; total: number; page: number; limit: number }>("/api/wallet/transactions", {
          page: cmdOpts.page,
          limit: cmdOpts.limit,
        });
        spinner?.stop();
        printTable(
          [
            { header: "Type", key: "type", width: 16 },
            { header: "Amount", key: "amount_sats", width: 12 },
            { header: "Balance After", key: "balance_after", width: 14 },
            { header: "Status", key: "status", width: 12 },
            { header: "Date", key: "created_at", transform: relativeDate },
          ],
          result.transactions,
          opts as OutputOptions,
          { page: result.page, total: result.total, totalPages: Math.ceil(result.total / result.limit), limit: result.limit },
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  wallet
    .command("deposit <amount>")
    .description("Create a Lightning deposit invoice")
    .action(async (amount: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating invoice...").start();
      try {
        const client = createClient(opts);
        const result = await client.post<{ ok: boolean; payment_request: string; payment_hash: string; amount_sats: number }>("/api/wallet/deposit", {
          amount_sats: parseInt(amount, 10),
        });
        spinner?.stop();
        printDetail(
          [
            { label: "Amount (sats)", key: "amount_sats" },
            { label: "Payment Request", key: "payment_request" },
            { label: "Payment Hash", key: "payment_hash" },
          ],
          result as unknown as Record<string, unknown>,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  wallet
    .command("platform-balance")
    .description("Check platform wallet balance")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching platform balance...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ balance_sats: number; commission_sats: number }>("/api/wallet/platform-balance");
        spinner?.stop();
        printDetail(
          [
            { label: "Balance (sats)", key: "balance_sats" },
            { label: "Commission (sats)", key: "commission_sats" },
          ],
          result as unknown as Record<string, unknown>,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  // ugig wallet withdraw <amount> <destination>
  wallet
    .command("withdraw <amount> <destination>")
    .description("Withdraw sats to a Lightning Address or bolt11 invoice")
    .action(async (amount: string, destination: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = ora("Sending withdrawal...").start();
      try {
        const client = createClient(opts);
        const { data } = await client.post("/api/wallet/withdraw", {
          amount_sats: parseInt(amount),
          destination,
        });
        spinner.stop();
        printSuccess(
          `Withdrew ${parseInt(amount).toLocaleString()} sats to ${destination}\nNew balance: ${data.new_balance.toLocaleString()} sats`,
          opts as OutputOptions
        );
      } catch (err) {
        spinner.stop();
        handleError(err, opts as OutputOptions);
      }
    });
}
