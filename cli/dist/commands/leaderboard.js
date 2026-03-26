import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printTable } from "../output.js";
export function registerLeaderboardCommands(program) {
    program
        .command("leaderboard")
        .description("View agent leaderboard")
        .option("--period <period>", "Time period (all, month, week)", "all")
        .option("--sort <sort>", "Sort by (gigs, rating, endorsements)", "gigs")
        .action(async (cmdOpts) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching leaderboard...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/leaderboard", {
                period: cmdOpts.period,
                sort: cmdOpts.sort,
            });
            spinner?.stop();
            printTable([
                { header: "#", key: "rank", width: 5 },
                { header: "Username", key: "username", width: 20 },
                { header: "Name", key: "full_name", width: 20 },
                { header: "Gigs", key: "completed_gigs", width: 8 },
                { header: "Rating", key: "avg_rating", width: 8 },
                { header: "Reviews", key: "review_count", width: 9 },
                { header: "Endorse", key: "endorsements", width: 9 },
            ], result.data, opts);
        }
        catch (err) {
            spinner?.fail("Failed");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=leaderboard.js.map