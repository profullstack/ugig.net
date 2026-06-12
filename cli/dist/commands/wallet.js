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
    // ── Wallet address management ──────────────────────────────────
    const addresses = wallet
        .command("addresses")
        .description("Manage your profile wallet addresses (used by gig posters to pay you)");
    // ugig wallet addresses list
    addresses
        .command("list")
        .description("List wallet addresses stored in your ugig profile")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching wallet addresses...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/profile/wallet-addresses");
            spinner?.stop();
            const addrs = result.poster_addresses ?? [];
            if (addrs.length === 0 && !opts.json) {
                console.log("No wallet addresses saved. Run `ugig coinpay import` to import from CoinPay.");
                return;
            }
            printTable([
                { header: "Currency", key: "currency", width: 12 },
                { header: "Preferred", key: "is_preferred", width: 10 },
                { header: "Address", key: "address", width: 54 },
            ], addrs, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ugig wallet addresses set <currency> <address> [--preferred]
    addresses
        .command("set <currency> <address>")
        .description("Add or update a wallet address in your profile")
        .option("--preferred", "Mark this address as preferred for this currency")
        .action(async (currency, address, cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating wallet addresses...").start();
        try {
            const client = createClient(opts);
            // Fetch current addresses, upsert the new one
            const current = await client.get("/api/profile/wallet-addresses");
            const existing = current.poster_addresses ?? [];
            const idx = existing.findIndex((a) => a.currency === currency);
            const entry = { currency, address, is_preferred: !!cmdOpts.preferred };
            if (idx >= 0) {
                existing[idx] = entry;
            }
            else {
                existing.push(entry);
            }
            await client.put("/api/profile/wallet-addresses", { wallet_addresses: existing });
            spinner?.stop();
            printSuccess(`Saved ${currency} address to profile`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ugig wallet addresses remove <currency>
    addresses
        .command("remove <currency>")
        .description("Remove a wallet address for a currency from your profile")
        .action(async (currency) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Removing wallet address...").start();
        try {
            const client = createClient(opts);
            const current = await client.get("/api/profile/wallet-addresses");
            const existing = current.poster_addresses ?? [];
            const filtered = existing.filter((a) => a.currency !== currency);
            await client.put("/api/profile/wallet-addresses", { wallet_addresses: filtered });
            spinner?.stop();
            printSuccess(`Removed ${currency} address from profile`, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
    // ugig wallet addresses import  (convenience alias → coinpay import)
    addresses
        .command("import")
        .description("Import wallet addresses from your connected CoinPay account (alias: ugig coinpay import)")
        .option("--merge", "Merge with existing addresses instead of replacing")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching CoinPay wallets...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/coinpay/wallets");
            const data = result?.data ?? result;
            if (data.oauth_required) {
                spinner?.fail("Not connected");
                console.error("CoinPay OAuth not connected. Connect at Settings > Connections in the ugig web app.");
                process.exitCode = 1;
                return;
            }
            if (!data.wallets?.length) {
                spinner?.fail("No wallets");
                console.error("No CoinPay global wallet addresses found. Add them in CoinPayPortal > Settings > Global Wallet Addresses.");
                process.exitCode = 1;
                return;
            }
            const incoming = data.wallets.map((w, i) => ({
                currency: w.currency,
                address: w.address,
                is_preferred: i === 0,
            }));
            let toSave = incoming;
            if (cmdOpts.merge) {
                const current = await client.get("/api/profile/wallet-addresses");
                const existing = current?.poster_addresses ?? [];
                const merged = [...existing];
                for (const addr of incoming) {
                    const idx = merged.findIndex((a) => a.currency === addr.currency);
                    if (idx >= 0)
                        merged[idx] = addr;
                    else
                        merged.push(addr);
                }
                toSave = merged.slice(0, 20);
            }
            if (spinner)
                spinner.text = "Saving to profile...";
            await client.put("/api/profile/wallet-addresses", { wallet_addresses: toSave });
            spinner?.stop();
            printSuccess(`Imported ${toSave.length} wallet address${toSave.length !== 1 ? "es" : ""} to your profile`, opts);
            printTable([
                { header: "Currency", key: "currency", width: 12 },
                { header: "Preferred", key: "is_preferred", width: 10 },
                { header: "Address", key: "address", width: 50 },
            ], toSave, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=wallet.js.map