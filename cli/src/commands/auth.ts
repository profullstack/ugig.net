import type { Command } from "commander";
import ora from "ora";
import { createUnauthClient, createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printDetail, printSuccess, type OutputOptions } from "../output.js";

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authentication commands");

  auth
    .command("signup")
    .description("Create a new account")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--password <password>", "Password (8+ chars, upper/lower/number)")
    .requiredOption("--username <username>", "Username")
    .option("--account-type <type>", "Account type: human or agent", "human")
    .option("--agent-name <name>", "Agent display name (required for agents)")
    .option("--agent-description <desc>", "Agent description")
    .option("--agent-version <ver>", "Agent version")
    .option("--agent-operator-url <url>", "Agent operator URL")
    .option("--agent-source-url <url>", "Agent source code URL")
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating account...").start();
      try {
        const client = createUnauthClient(opts);
        const body: Record<string, unknown> = {
          email: options.email,
          password: options.password,
          username: options.username,
          account_type: options.accountType,
        };
        if (options.agentName) body.agent_name = options.agentName;
        if (options.agentDescription) body.agent_description = options.agentDescription;
        if (options.agentVersion) body.agent_version = options.agentVersion;
        if (options.agentOperatorUrl) body.agent_operator_url = options.agentOperatorUrl;
        if (options.agentSourceUrl) body.agent_source_url = options.agentSourceUrl;

        const result = await client.post("/api/auth/signup", body);
        spinner?.succeed("Account created");
        printSuccess("Account created successfully. Generate an API key to use the CLI.", opts as OutputOptions);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        spinner?.fail("Signup failed");
        handleError(err, opts as OutputOptions);
      }
    });

  auth
    .command("login")
    .description("Login to your account")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--password <password>", "Password")
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Logging in...").start();
      try {
        const client = createUnauthClient(opts);
        const result = await client.post<{ message: string; user: Record<string, unknown> }>(
          "/api/auth/login",
          { email: options.email, password: options.password }
        );
        spinner?.succeed("Logged in");
        printSuccess(result.message || "Login successful", opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Login failed");
        handleError(err, opts as OutputOptions);
      }
    });

  auth
    .command("whoami")
    .description("Show current authenticated user")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching profile...").start();
      try {
        const client = createClient(opts);
        const result = await client.get<{ profile: Record<string, unknown> }>("/api/profile");
        spinner?.succeed("Authenticated");
        printDetail(
          [
            { label: "Username", key: "username" },
            { label: "Name", key: "full_name" },
            { label: "Email", key: "email" },
            { label: "Account Type", key: "account_type" },
            { label: "Agent Name", key: "agent_name" },
            { label: "Available", key: "is_available", transform: (v) => v ? "Yes" : "No" },
          ],
          result.profile,
          opts as OutputOptions
        );
      } catch (err) {
        spinner?.fail("Auth check failed");
        handleError(err, opts as OutputOptions);
      }
    });
}
