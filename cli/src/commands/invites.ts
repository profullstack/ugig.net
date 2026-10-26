import type { Command } from "commander";
import ora from "ora";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { printTable, printDetail, printSuccess, type OutputOptions, relativeDate } from "../output.js";

type Overview = {
  quota: { total: number; used: number; left: number };
  invites: Record<string, unknown>[];
  canInvite: boolean;
  unlocksAt: string | null;
  bonusDays: number;
  referral: { code: string; link: string } | null;
};

/** `ugig redeem <code>` and `ugig invites ...`: credit codes and scarce invites. */
export function registerInvitesCommands(program: Command): void {
  program
    .command("redeem <code>")
    .description("Redeem a credit code for days of Pro")
    .action(async (code: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Redeeming...").start();
      try {
        const result = await createClient(opts).post<{
          granted: { unit: string; amount: number };
          current_period_end: string | null;
        }>("/api/credits/redeem", { code });
        spinner?.stop();
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const until = result.current_period_end
          ? ` Pro is active until ${result.current_period_end.slice(0, 10)}.`
          : "";
        printSuccess(`Redeemed ${result.granted.amount} days of Pro.${until}`, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  const invites = program.command("invites").description("Your invites (3 per account; both people get days of Pro)");

  invites
    .command("list", { isDefault: true })
    .description("Show your invite quota and the invites you sent")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Fetching invites...").start();
      try {
        const result = await createClient(opts).get<Overview>("/api/invites");
        spinner?.stop();
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(
          `  Invites left: ${result.quota.left} of ${result.quota.total} | Bonus: ${result.bonusDays} days of Pro each` +
            (result.canInvite ? "" : result.unlocksAt ? ` | unlocks ${result.unlocksAt.slice(0, 10)}` : " | locked") +
            "\n"
        );
        printTable(
          [
            { header: "ID", key: "id", width: 22 },
            { header: "Status", key: "status", width: 9 },
            { header: "Note", key: "note", width: 24 },
            { header: "Joined", key: "usedByUsername", width: 18 },
            { header: "Bonus", key: "bonus", width: 8 },
            { header: "Created", key: "createdAt", transform: (v) => relativeDate(new Date(Number(v)).toISOString()) },
          ],
          result.invites,
          opts as OutputOptions,
        );
        if (result.referral) console.log(`\n  Referral link (unlimited): ${result.referral.link}`);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  invites
    .command("create")
    .description("Create an invite (the code is shown once)")
    .option("--note <note>", "Private note: who it is for")
    .action(async (cmdOpts: { note?: string }) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Creating invite...").start();
      try {
        const result = await createClient(opts).post<{ invite: Record<string, unknown> }>("/api/invites", {
          note: cmdOpts.note ?? "",
        });
        spinner?.stop();
        printDetail(
          [
            { label: "Code", key: "code" },
            { label: "Link", key: "url" },
            { label: "ID", key: "id" },
          ],
          result.invite,
          opts as OutputOptions,
        );
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  invites
    .command("accept <code>")
    .description("Join on an invite (new accounts only)")
    .action(async (code: string) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Accepting invite...").start();
      try {
        const result = await createClient(opts).post<{ message: string }>("/api/invites/accept", { code });
        spinner?.stop();
        printSuccess(result.message, opts as OutputOptions);
      } catch (err) {
        spinner?.fail("Failed");
        handleError(err, opts as OutputOptions);
      }
    });

  invites
    .command("revoke <id>")
    .description("Withdraw an unused invite (its slot is refunded)")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        await createClient(opts).delete(`/api/invites/${encodeURIComponent(id)}`);
        printSuccess("Invite withdrawn.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });
}
