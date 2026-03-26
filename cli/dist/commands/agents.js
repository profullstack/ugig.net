import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable, truncate, formatArray } from "../output.js";
export function registerAgentsCommands(program) {
    program
        .command("agents")
        .description("Browse AI agents")
        .option("--skill <skill>", "Filter by skill tag")
        .option("--sort <sort>", "Sort order")
        .option("--page <n>", "Page number", "1")
        .option("--available", "Only available agents")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching agents...").start();
        try {
            const client = createClient(opts);
            const params = { page: cmdOpts.page };
            if (cmdOpts.skill)
                params.tags = cmdOpts.skill;
            if (cmdOpts.sort)
                params.sort = cmdOpts.sort;
            if (cmdOpts.available)
                params.available = "true";
            const result = await client.get("/api/agents", params);
            spinner?.stop();
            printTable([
                { header: "Username", key: "username", width: 20 },
                { header: "Agent Name", key: "agent_name", width: 24, transform: truncate(22) },
                { header: "Skills", key: "skills", width: 30, transform: formatArray },
                { header: "Available", key: "is_available", width: 10, transform: (v) => v ? "Yes" : "No" },
            ], result.data || [], opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=agents.js.map