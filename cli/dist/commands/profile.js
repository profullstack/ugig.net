import ora from "ora";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import { createClient, handleError, parseList } from "../helpers.js";
import { printDetail, printSuccess, formatArray, formatDate } from "../output.js";
export function registerProfileCommands(program) {
    const profile = program
        .command("profile")
        .description("Manage your profile");
    profile
        .command("get")
        .description("View your profile")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching profile...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/profile");
            spinner?.stop();
            printDetail([
                { label: "Username", key: "username" },
                { label: "Full Name", key: "full_name" },
                { label: "Account Type", key: "account_type" },
                { label: "Bio", key: "bio" },
                { label: "Skills", key: "skills", transform: formatArray },
                { label: "AI Tools", key: "ai_tools", transform: formatArray },
                { label: "Hourly Rate", key: "hourly_rate", transform: (v) => v ? `$${v}/hr` : "-" },
                { label: "Location", key: "location" },
                { label: "Timezone", key: "timezone" },
                { label: "Available", key: "is_available", transform: (v) => v ? "Yes" : "No" },
                { label: "Portfolio", key: "portfolio_urls", transform: formatArray },
                { label: "Agent Name", key: "agent_name" },
                { label: "Agent Version", key: "agent_version" },
                { label: "Operator URL", key: "agent_operator_url" },
                { label: "DID", key: "did" },
                { label: "Created", key: "created_at", transform: (v) => formatDate(v) },
            ], result.profile, opts);
        }
        catch (err) {
            spinner?.fail("Failed to fetch profile");
            handleError(err, opts);
        }
    });
    profile
        .command("update")
        .description("Update your profile")
        .option("--username <username>", "Username")
        .option("--full-name <name>", "Full name")
        .option("--bio <bio>", "Bio")
        .option("--skills <skills>", "Skills (comma-separated)")
        .option("--ai-tools <tools>", "AI tools (comma-separated)")
        .option("--hourly-rate <rate>", "Hourly rate", parseFloat)
        .option("--portfolio-urls <urls>", "Portfolio URLs (comma-separated)")
        .option("--location <location>", "Location")
        .option("--timezone <tz>", "Timezone")
        .option("--available <bool>", "Is available (true/false)")
        .option("--agent-name <name>", "Agent name")
        .option("--agent-description <desc>", "Agent description")
        .option("--agent-version <ver>", "Agent version")
        .option("--agent-operator-url <url>", "Agent operator URL")
        .option("--agent-source-url <url>", "Agent source URL")
        .option("--did <did>", "Decentralized identifier (DID)")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Updating profile...").start();
        try {
            const client = createClient(opts);
            // Fetch current profile first (PUT semantics)
            const current = await client.get("/api/profile");
            const body = { ...current.profile };
            // Merge provided fields
            if (options.username !== undefined)
                body.username = options.username;
            if (options.fullName !== undefined)
                body.full_name = options.fullName;
            if (options.bio !== undefined)
                body.bio = options.bio;
            if (options.skills !== undefined)
                body.skills = parseList(options.skills);
            if (options.aiTools !== undefined)
                body.ai_tools = parseList(options.aiTools);
            if (options.hourlyRate !== undefined)
                body.hourly_rate = options.hourlyRate;
            if (options.portfolioUrls !== undefined)
                body.portfolio_urls = parseList(options.portfolioUrls);
            if (options.location !== undefined)
                body.location = options.location;
            if (options.timezone !== undefined)
                body.timezone = options.timezone;
            if (options.available !== undefined)
                body.is_available = options.available === "true";
            if (options.agentName !== undefined)
                body.agent_name = options.agentName;
            if (options.agentDescription !== undefined)
                body.agent_description = options.agentDescription;
            if (options.agentVersion !== undefined)
                body.agent_version = options.agentVersion;
            if (options.agentOperatorUrl !== undefined)
                body.agent_operator_url = options.agentOperatorUrl;
            if (options.agentSourceUrl !== undefined)
                body.agent_source_url = options.agentSourceUrl;
            if (options.did !== undefined)
                body.did = options.did;
            await client.put("/api/profile", body);
            spinner?.succeed("Profile updated");
            printSuccess("Profile updated successfully.", opts);
        }
        catch (err) {
            spinner?.fail("Failed to update profile");
            handleError(err, opts);
        }
    });
    profile
        .command("avatar")
        .description("Upload profile avatar")
        .argument("<file>", "Path to image file (JPEG, PNG, WebP, GIF, max 5MB)")
        .action(async (filePath) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Uploading avatar...").start();
        try {
            if (!existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            const fileBuffer = readFileSync(filePath);
            const fileName = basename(filePath);
            const ext = fileName.split(".").pop()?.toLowerCase() || "";
            const mimeTypes = {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
                gif: "image/gif",
            };
            const mimeType = mimeTypes[ext];
            if (!mimeType) {
                throw new Error("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
            }
            const client = createClient(opts);
            const result = await client.uploadFile("/api/profile/avatar", fileBuffer, fileName, mimeType);
            spinner?.succeed("Avatar uploaded");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log(`Avatar URL: ${result.avatar_url}`);
            }
        }
        catch (err) {
            spinner?.fail("Failed to upload avatar");
            handleError(err, opts);
        }
    });
    profile
        .command("banner")
        .description("Upload profile banner")
        .argument("<file>", "Path to image file (JPEG, PNG, WebP, GIF, max 5MB)")
        .action(async (filePath) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Uploading banner...").start();
        try {
            if (!existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            const fileBuffer = readFileSync(filePath);
            const fileName = basename(filePath);
            const ext = fileName.split(".").pop()?.toLowerCase() || "";
            const mimeTypes = {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
                gif: "image/gif",
            };
            const mimeType = mimeTypes[ext];
            if (!mimeType) {
                throw new Error("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
            }
            const client = createClient(opts);
            const result = await client.uploadFile("/api/profile/banner", fileBuffer, fileName, mimeType);
            spinner?.succeed("Banner uploaded");
            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log(`Banner URL: ${result.banner_url}`);
            }
        }
        catch (err) {
            spinner?.fail("Failed to upload banner");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=profile.js.map