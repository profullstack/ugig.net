import chalk from "chalk";
import { loadConfig, saveConfig, getConfigPath } from "../config.js";
export function registerConfigCommands(program) {
    const config = program
        .command("config")
        .description("Manage CLI configuration");
    config
        .command("set <key> <value>")
        .description("Set a config value (api_key, base_url)")
        .action((key, value) => {
        const opts = program.opts();
        if (key !== "api_key" && key !== "base_url") {
            if (opts.json) {
                console.log(JSON.stringify({ error: `Unknown config key: ${key}. Valid keys: api_key, base_url` }));
            }
            else {
                console.error(chalk.red(`  Unknown config key: ${key}`));
                console.error(chalk.dim("  Valid keys: api_key, base_url"));
            }
            process.exitCode = 2;
            return;
        }
        saveConfig({ [key]: value });
        if (opts.json) {
            console.log(JSON.stringify({ success: true, key, value: key === "api_key" ? maskKey(value) : value }));
        }
        else {
            const displayValue = key === "api_key" ? maskKey(value) : value;
            console.log(chalk.green(`  Set ${key} = ${displayValue}`));
        }
    });
    config
        .command("get <key>")
        .description("Get a config value")
        .action((key) => {
        const opts = program.opts();
        const cfg = loadConfig();
        const value = key === "api_key" ? cfg.api_key : key === "base_url" ? cfg.base_url : undefined;
        if (value === undefined) {
            if (opts.json) {
                console.log(JSON.stringify({ error: `Unknown or unset key: ${key}` }));
            }
            else {
                console.error(chalk.dim(`  ${key} is not set`));
            }
            return;
        }
        const display = key === "api_key" ? maskKey(value) : value;
        if (opts.json) {
            console.log(JSON.stringify({ [key]: display }));
        }
        else {
            console.log(`  ${display}`);
        }
    });
    config
        .command("show")
        .description("Show entire configuration")
        .action(() => {
        const opts = program.opts();
        const cfg = loadConfig();
        const display = {
            api_key: cfg.api_key ? maskKey(cfg.api_key) : "(not set)",
            base_url: cfg.base_url,
            config_path: getConfigPath(),
        };
        if (opts.json) {
            console.log(JSON.stringify(display, null, 2));
        }
        else {
            console.log(`  ${chalk.bold("API Key:".padEnd(14))}${display.api_key}`);
            console.log(`  ${chalk.bold("Base URL:".padEnd(14))}${display.base_url}`);
            console.log(`  ${chalk.bold("Config Path:".padEnd(14))}${display.config_path}`);
        }
    });
    config
        .command("path")
        .description("Print the config file path")
        .action(() => {
        const opts = program.opts();
        const p = getConfigPath();
        if (opts.json) {
            console.log(JSON.stringify({ path: p }));
        }
        else {
            console.log(`  ${p}`);
        }
    });
}
function maskKey(key) {
    if (key.length <= 16)
        return key.slice(0, 4) + "****";
    return key.slice(0, 16) + "****" + key.slice(-4);
}
//# sourceMappingURL=config-cmd.js.map