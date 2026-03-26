import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printDetail, printTable, printSuccess, relativeDate } from "../output.js";
export function registerWalletCommands(program) {
    const wallet = program.command("wallet").description("Wallet management");
    wallet
        .command("balance")
        .description("Check your wallet balance")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching balance...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/wallet/balance");
            spinner?.stop();
            printDetail([{ label: "Balance (sats)", key: "balance_sats" }], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    wallet
        .command("transactions")
        .description("List wallet transactions")
        .option("--page <n>", "Page number", "1")
        .option("--limit <n>", "Results per page", "20")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching transactions...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/wallet/transactions", {
                page: cmdOpts.page,
                limit: cmdOpts.limit,
            });
            spinner?.stop();
            printTable([
                { header: "Type", key: "type", width: 16 },
                { header: "Amount", key: "amount_sats", width: 12 },
                { header: "Balance After", key: "balance_after", width: 14 },
                { header: "Status", key: "status", width: 12 },
                { header: "Date", key: "created_at", transform: relativeDate },
            ], result.transactions, opts, { page: result.page, total: result.total, totalPages: Math.ceil(result.total / result.limit), limit: result.limit });
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    wallet
        .command("deposit <amount>")
        .description("Create a Lightning deposit invoice")
        .action(async (amount) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Creating invoice...").start();
        try {
            const client = createClient(opts);
            const result = await client.post("/api/wallet/deposit", {
                amount_sats: parseInt(amount, 10),
            });
            spinner?.stop();
            printDetail([
                { label: "Amount (sats)", key: "amount_sats" },
                { label: "Payment Request", key: "payment_request" },
                { label: "Payment Hash", key: "payment_hash" },
            ], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    wallet
        .command("platform-balance")
        .description("Check platform wallet balance")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching platform balance...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/wallet/platform-balance");
            spinner?.stop();
            printDetail([
                { label: "Balance (sats)", key: "balance_sats" },
                { label: "Commission (sats)", key: "commission_sats" },
            ], result, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ugig wallet withdraw <amount> <destination>
    wallet
        .command("withdraw <amount> <destination>")
        .description("Withdraw sats to a Lightning Address or bolt11 invoice")
        .action(async (amount, destination) => {
        const opts = program.opts();
        const spinner = ora("Sending withdrawal...").start();
        try {
            const client = createClient(opts);
            const { data } = await client.post("/api/wallet/withdraw", {
                amount_sats: parseInt(amount),
                destination,
            });
            spinner.stop();
            printSuccess(`Withdrew ${parseInt(amount).toLocaleString()} sats to ${destination}\nNew balance: ${data.new_balance.toLocaleString()} sats`, opts);
        }
        catch (err) {
            spinner.stop();
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=wallet.js.map