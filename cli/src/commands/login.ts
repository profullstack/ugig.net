import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { hostname } from "node:os";
import { getBaseUrl, saveConfig, getConfigPath } from "../config.js";

interface StartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface PollResponse {
  status?: string;
  api_key?: string;
}

// Headless login: ask the server for a device code, show the user a URL to approve
// on any device, and poll until an API key is minted and stored. No password on
// this machine, works over SSH / on a server.
export function registerLoginCommands(program: Command): void {
  program
    .command("login")
    .description("Log in from this device — approve in a browser on any device, no password needed")
    .option("--public", "Request a public (read-only listing) key instead of full access")
    .action(async (opts: { public?: boolean }) => {
      const globalOpts = program.opts() as { baseUrl?: string; json?: boolean };
      const base = getBaseUrl(globalOpts.baseUrl);

      let start: StartResponse;
      try {
        const res = await fetch(`${base}/api/cli-auth/start`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: opts.public ? "public" : "full", client_name: hostname() }),
        });
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        start = (await res.json()) as StartResponse;
      } catch (err) {
        console.error(chalk.red("  Couldn't start login: ") + (err as Error).message);
        process.exitCode = 1;
        return;
      }

      console.log("");
      console.log("  To log in, open this URL on any device (e.g. your desktop) and approve:");
      console.log("");
      console.log("    " + chalk.cyan(start.verification_uri_complete));
      console.log("");
      console.log(
        "  …or go to " + chalk.cyan(start.verification_uri) + " and enter code " + chalk.bold(start.user_code),
      );
      console.log("");

      const spinner = ora("Waiting for approval…").start();
      const deadline = Date.now() + start.expires_in * 1000;
      const intervalMs = Math.max(1, start.interval || 5) * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        let data: PollResponse = {};
        try {
          const res = await fetch(`${base}/api/cli-auth/poll`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ device_code: start.device_code }),
          });
          if (res.status === 202) continue; // authorization_pending
          data = (await res.json().catch(() => ({}))) as PollResponse;
        } catch {
          continue; // transient network error — keep polling
        }

        if (data.status === "complete" && data.api_key) {
          saveConfig({ api_key: data.api_key });
          spinner.succeed("Logged in! API key saved to " + getConfigPath());
          if (globalOpts.json) console.log(JSON.stringify({ success: true }));
          return;
        }
        if (data.status === "denied") {
          spinner.fail("Request denied.");
          process.exitCode = 1;
          return;
        }
        if (data.status === "expired") {
          spinner.fail("Login request expired — run `ugig login` again.");
          process.exitCode = 1;
          return;
        }
      }

      spinner.fail("Timed out waiting for approval.");
      process.exitCode = 1;
    });

  program
    .command("logout")
    .description("Remove the stored API key from this device")
    .action(() => {
      saveConfig({ api_key: undefined });
      console.log(chalk.green("  Logged out") + chalk.dim(" — API key removed from " + getConfigPath()));
    });
}
