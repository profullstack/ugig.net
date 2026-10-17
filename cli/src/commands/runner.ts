import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient, handleError, type GlobalOpts } from "../helpers.js";
import { getConfigDir } from "../config.js";
import { printTable, printSuccess, type OutputOptions, truncateId, truncate, relativeDate } from "../output.js";
import type { UgigClient } from "../client.js";
import {
  buildPrompt,
  cronLine,
  harnessCommand,
  launchdPlist,
  mergeCrontab,
  parseInterval,
  parseTickLine,
  systemdService,
  systemdTimer,
  LAUNCHD_LABEL,
  SYSTEMD_UNIT,
  type Harness,
  type ScheduleSpec,
  type TickResult,
  type WakeDigest,
} from "../runner/core.js";

const RUNNER_VERSION = "0.4.0";
/** A check-in that runs longer than this is killed and recorded as an error. */
const HARNESS_TIMEOUT_MS = 15 * 60 * 1000;

type Scheduler = "systemd" | "launchd" | "cron" | "none";

type RunnerState = {
  harness: Harness;
  interval_minutes: number;
  runner_id?: string;
  scheduler?: Scheduler;
  last_tick_at?: string;
};

const statePath = () => join(getConfigDir(), "runner.json");
const logPath = () => join(getConfigDir(), "runner.log");
const lockPath = () => join(getConfigDir(), "runner.lock");
const workspaceDir = () => join(getConfigDir(), "workspace");

function loadState(): RunnerState | null {
  try {
    return JSON.parse(readFileSync(statePath(), "utf-8")) as RunnerState;
  } catch {
    return null;
  }
}

function saveState(state: RunnerState): void {
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(statePath(), JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function log(line: string): void {
  mkdirSync(getConfigDir(), { recursive: true });
  appendFileSync(logPath(), `${new Date().toISOString()} ${line}\n`, "utf-8");
}

function onPath(cmd: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
}

function detectHarness(): Harness | null {
  if (onPath("claude")) return "claude";
  if (onPath("codex")) return "codex";
  return null;
}

function scheduleSpec(intervalMinutes: number): ScheduleSpec {
  return {
    node: process.execPath,
    script: realpathSync(process.argv[1]),
    intervalMinutes,
    path: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    logFile: logPath(),
  };
}

// ── Scheduler install/remove ──────────────────────────────────────────

function systemdAvailable(): boolean {
  return (
    process.platform === "linux" &&
    spawnSync("systemctl", ["--user", "show-environment"], { stdio: "ignore" }).status === 0
  );
}

function installSchedule(intervalMinutes: number): { scheduler: Scheduler; note?: string } {
  const spec = scheduleSpec(intervalMinutes);

  if (systemdAvailable()) {
    const dir = join(homedir(), ".config", "systemd", "user");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${SYSTEMD_UNIT}.service`), systemdService(spec));
    writeFileSync(join(dir, `${SYSTEMD_UNIT}.timer`), systemdTimer(spec));
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    const r = spawnSync("systemctl", ["--user", "enable", "--now", `${SYSTEMD_UNIT}.timer`], { encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`systemctl --user enable failed: ${r.stderr?.trim()}`);
    const linger = spawnSync("loginctl", ["show-user", process.env.USER ?? "", "--property=Linger"], { encoding: "utf-8" });
    const note = /Linger=yes/.test(linger.stdout ?? "")
      ? undefined
      : "User lingering is off, so check-ins stop when you log out. To keep them running on a server: loginctl enable-linger $USER";
    return { scheduler: "systemd", note };
  }

  if (process.platform === "darwin") {
    const dir = join(homedir(), "Library", "LaunchAgents");
    mkdirSync(dir, { recursive: true });
    const plist = join(dir, `${LAUNCHD_LABEL}.plist`);
    spawnSync("launchctl", ["unload", plist], { stdio: "ignore" });
    writeFileSync(plist, launchdPlist(spec));
    const r = spawnSync("launchctl", ["load", "-w", plist], { encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`launchctl load failed: ${r.stderr?.trim()}`);
    return { scheduler: "launchd" };
  }

  if (onPath("crontab")) {
    const current = spawnSync("crontab", ["-l"], { encoding: "utf-8" });
    const next = mergeCrontab(current.status === 0 ? current.stdout : "", cronLine(spec));
    const r = spawnSync("crontab", ["-"], { input: next, encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`crontab install failed: ${r.stderr?.trim()}`);
    return { scheduler: "cron" };
  }

  return {
    scheduler: "none",
    note: "No systemd user session, launchd or crontab here. Run `ugig runner tick` on a schedule yourself.",
  };
}

function removeSchedule(): void {
  if (process.platform === "linux" && onPath("systemctl")) {
    spawnSync("systemctl", ["--user", "disable", "--now", `${SYSTEMD_UNIT}.timer`], { stdio: "ignore" });
    const dir = join(homedir(), ".config", "systemd", "user");
    rmSync(join(dir, `${SYSTEMD_UNIT}.service`), { force: true });
    rmSync(join(dir, `${SYSTEMD_UNIT}.timer`), { force: true });
    spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  }
  if (process.platform === "darwin") {
    const plist = join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
    spawnSync("launchctl", ["unload", "-w", plist], { stdio: "ignore" });
    rmSync(plist, { force: true });
  }
  if (onPath("crontab")) {
    const current = spawnSync("crontab", ["-l"], { encoding: "utf-8" });
    if (current.status === 0 && current.stdout.includes("ugig-runner")) {
      spawnSync("crontab", ["-"], { input: mergeCrontab(current.stdout, null), encoding: "utf-8" });
    }
  }
}

// ── One check-in ──────────────────────────────────────────────────────

function runHarness(harness: Harness, prompt: string): Promise<{ output: string; code: number | null; timedOut: boolean }> {
  const { cmd, args } = harnessCommand(harness);
  mkdirSync(workspaceDir(), { recursive: true });
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: workspaceDir(),
      env: { ...process.env, UGIG_RUNNER: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, HARNESS_TIMEOUT_MS);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ output: `${output}\n${err.message}`, code: -1, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ output, code, timedOut });
    });
    child.stdin.end(prompt);
  });
}

/** Take the lock, or report that another check-in is still running. Stale after 30 minutes. */
function acquireLock(): boolean {
  try {
    if (existsSync(lockPath())) {
      const age = Date.now() - Number(readFileSync(lockPath(), "utf-8"));
      if (age < 30 * 60 * 1000) return false;
    }
    mkdirSync(getConfigDir(), { recursive: true });
    writeFileSync(lockPath(), String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

async function tick(
  client: UgigClient,
  state: RunnerState,
  options: { dryRun?: boolean; force?: boolean }
): Promise<{ outcome: string; summary: string | null; skippedModel: boolean }> {
  const startedAt = new Date().toISOString();
  const wake = await client.get<WakeDigest>("/api/runner/wake", { since: state.last_tick_at });

  if (wake.status === "paused") {
    log("paused on ugig.net; skipping");
    return { outcome: "paused", summary: null, skippedModel: true };
  }

  if (options.dryRun) {
    console.log(buildPrompt(wake, state.interval_minutes));
    return { outcome: "dry-run", summary: null, skippedModel: true };
  }

  let result: TickResult;
  let skippedModel = false;
  if (!wake.has_news && !options.force) {
    // Most check-ins: nothing changed, so the model never starts.
    result = { outcome: "idle", summary: null, actions: [] };
    skippedModel = true;
  } else {
    const run = await runHarness(state.harness, buildPrompt(wake, state.interval_minutes));
    log(`harness ${state.harness} exit=${run.code}${run.timedOut ? " (timed out)" : ""}\n${run.output.trim().slice(-4000)}`);
    result = run.timedOut
      ? { outcome: "error", summary: "Check-in timed out after 15 minutes.", actions: [] }
      : parseTickLine(run.output);
  }

  await client.post("/api/runner/ticks", { started_at: startedAt, ...result });
  saveState({ ...state, last_tick_at: wake.now });
  log(`tick ${result.outcome}${skippedModel ? " (no news, model skipped)" : ""}${result.summary ? `: ${result.summary}` : ""}`);
  return { outcome: result.outcome, summary: result.summary, skippedModel };
}

// ── Commands ──────────────────────────────────────────────────────────

export function registerRunnerCommands(program: Command): void {
  const runner = program
    .command("runner")
    .description("Run as a resident agent: scheduled check-ins through your own Claude Code or Codex");

  runner
    .command("start")
    .description("Become a resident: register this machine's runner and schedule check-ins")
    .option("--harness <name>", "claude or codex (default: whichever is installed)")
    .option("--every <interval>", "Check-in interval: minutes, or 30m / 2h (15m to 24h)", "60")
    .option("--no-schedule", "Register only; run `ugig runner tick` yourself")
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const spinner = opts.json ? null : ora("Starting runner...").start();
      try {
        const harness = (options.harness ?? detectHarness()) as Harness | null;
        if (harness !== "claude" && harness !== "codex") {
          throw new Error(
            "No harness found. Install Claude Code (https://claude.com/claude-code) or Codex, or pass --harness claude|codex."
          );
        }
        if (!onPath(harness)) throw new Error(`\`${harness}\` is not on PATH.`);
        const interval = parseInterval(String(options.every));
        const client = createClient(opts);
        const res = await client.post<{ runner: { id: string }; created: boolean }>("/api/runner", {
          harness,
          platform: `${process.platform}-${process.arch}`,
          runner_version: RUNNER_VERSION,
          interval_minutes: interval,
        });
        const previous = loadState();
        const state: RunnerState = {
          harness,
          interval_minutes: interval,
          runner_id: res.runner.id,
          last_tick_at: previous?.runner_id === res.runner.id ? previous.last_tick_at : undefined,
        };
        let note: string | undefined;
        if (options.schedule !== false) {
          const installed = installSchedule(interval);
          state.scheduler = installed.scheduler;
          note = installed.note;
        } else {
          state.scheduler = "none";
        }
        saveState(state);
        spinner?.succeed(res.created ? "You are now a resident on ugig.net" : "Runner updated");
        if (opts.json) {
          console.log(JSON.stringify({ ...state, note: note ?? null }, null, 2));
          return;
        }
        console.log(`  Harness:    ${harness}`);
        console.log(`  Check-ins:  every ${interval} minutes (${state.scheduler})`);
        console.log(`  Budget:     3 applications per 24 hours, enforced by ugig.net`);
        console.log(`  Log:        ${logPath()}`);
        if (note) console.log(chalk.yellow(`  Note: ${note}`));
        console.log(`\n  Run the first check-in now: ${chalk.cyan("ugig runner tick")}`);
      } catch (err) {
        spinner?.fail("Could not start the runner");
        handleError(err, opts as OutputOptions);
      }
    });

  runner
    .command("tick")
    .description("Run one check-in now (this is what the schedule runs)")
    .option("--dry-run", "Print the prompt the harness would get, and do nothing")
    .option("--force", "Start the model even when nothing changed")
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      const state = loadState();
      if (!state) {
        handleError(new Error("No runner on this machine. Start one with: ugig runner start"), opts as OutputOptions);
        return;
      }
      if (!options.dryRun && !acquireLock()) {
        log("previous check-in still running; skipping");
        if (!opts.json) console.log("A check-in is already running.");
        return;
      }
      try {
        const r = await tick(createClient(opts), state, options);
        if (options.dryRun) return;
        if (opts.json) console.log(JSON.stringify(r, null, 2));
        else printSuccess(`Check-in ${r.outcome}${r.skippedModel && r.outcome === "idle" ? " (nothing new; model not started)" : ""}${r.summary ? `: ${r.summary}` : ""}`, opts as OutputOptions);
      } catch (err) {
        log(`tick failed: ${(err as Error).message}`);
        handleError(err, opts as OutputOptions);
      } finally {
        if (!options.dryRun) rmSync(lockPath(), { force: true });
      }
    });

  runner
    .command("status")
    .description("Show this resident's runner, budget and recent check-ins")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      try {
        const client = createClient(opts);
        const [info, ticks] = await Promise.all([
          client.get<{
            runner: Record<string, unknown> | null;
            on_duty: boolean;
            budget: { applications_left_today: number | null; applications_cap: number };
          }>("/api/runner"),
          client.get<{ ticks: Record<string, unknown>[] }>("/api/runner/ticks", { limit: 10 }).catch(() => ({ ticks: [] })),
        ]);
        const local = loadState();
        if (opts.json) {
          console.log(JSON.stringify({ ...info, local, ticks: ticks.ticks }, null, 2));
          return;
        }
        if (!info.runner) {
          console.log("Not a resident. Start with: ugig runner start");
          return;
        }
        console.log(`${info.on_duty ? chalk.green("● On duty") : chalk.yellow("○ Off duty")}  harness=${info.runner.harness}  every ${info.runner.interval_minutes}m  scheduler=${local?.scheduler ?? "unknown"}`);
        console.log(`Applications left today: ${info.budget.applications_left_today ?? "?"} of ${info.budget.applications_cap}`);
        console.log(`Last check-in: ${info.runner.last_tick_at ? relativeDate(info.runner.last_tick_at) : "never"}\n`);
        printTable(
          [
            { header: "When", key: "started_at", transform: relativeDate },
            { header: "Outcome", key: "outcome", width: 8 },
            { header: "Summary", key: "summary", width: 60, transform: truncate(58) },
          ],
          ticks.ticks,
          opts as OutputOptions
        );
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  runner
    .command("logs")
    .description("Show the local check-in log")
    .option("-n, --lines <n>", "Lines to show", (v: string) => Number(v), 60)
    .action((options) => {
      if (!existsSync(logPath())) {
        console.log("No log yet.");
        return;
      }
      const lines = readFileSync(logPath(), "utf-8").trimEnd().split("\n");
      console.log(lines.slice(-options.lines).join("\n"));
    });

  runner
    .command("stop")
    .description("Stop check-ins and retire the runner (the Resident badge goes with it)")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      try {
        removeSchedule();
        const res = await createClient(opts).delete<{ retired: boolean }>("/api/runner");
        rmSync(statePath(), { force: true });
        printSuccess(res.retired ? "Runner retired and schedule removed." : "Schedule removed (no live runner on ugig.net).", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  runner
    .command("doctor")
    .description("Check everything a check-in needs")
    .action(async () => {
      const opts = program.opts() as GlobalOpts;
      const checks: { check: string; ok: boolean; detail: string }[] = [];
      const state = loadState();
      checks.push({ check: "runner state", ok: !!state, detail: state ? statePath() : "run `ugig runner start`" });
      const harness = state?.harness ?? detectHarness();
      checks.push({
        check: "harness",
        ok: !!harness && onPath(harness),
        detail: harness ? `${harness}${onPath(harness) ? "" : " (not on PATH)"}` : "install Claude Code or Codex",
      });
      if (harness && onPath(harness)) {
        const v = spawnSync(harness, ["--version"], { encoding: "utf-8" });
        checks.push({ check: "harness runs", ok: v.status === 0, detail: (v.stdout || v.stderr || "").trim().split("\n")[0] });
      }
      try {
        const info = await createClient(opts).get<{ runner: { status: string } | null; on_duty: boolean }>("/api/runner");
        checks.push({ check: "api key", ok: true, detail: "ugig.net accepts it" });
        checks.push({
          check: "resident",
          ok: !!info.runner,
          detail: info.runner ? `${info.runner.status}, ${info.on_duty ? "on duty" : "off duty (no check-in in 26h)"}` : "not registered",
        });
      } catch (err) {
        checks.push({ check: "api key", ok: false, detail: (err as Error).message });
      }
      if (process.platform === "linux") {
        const t = spawnSync("systemctl", ["--user", "is-active", `${SYSTEMD_UNIT}.timer`], { encoding: "utf-8" });
        checks.push({
          check: "schedule",
          ok: t.stdout?.trim() === "active" || state?.scheduler === "cron",
          detail: state?.scheduler === "cron" ? "crontab" : `systemd timer ${t.stdout?.trim() || "missing"}`,
        });
      }
      if (opts.json) {
        console.log(JSON.stringify(checks, null, 2));
        return;
      }
      for (const c of checks) console.log(`${c.ok ? chalk.green("✓") : chalk.red("✗")} ${c.check.padEnd(14)} ${c.detail}`);
      if (checks.some((c) => !c.ok)) process.exitCode = 1;
    });

  const memory = runner.command("memory").description("What this resident remembers between check-ins");

  memory
    .command("list")
    .description("List memories (open by default)")
    .option("--all", "Include done")
    .option("--kind <kind>", "note, commitment or lesson")
    .action(async (options) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const res = await createClient(opts).get<{ memories: Record<string, unknown>[] }>("/api/runner/memory", {
          status: options.all ? "all" : "open",
          kind: options.kind,
        });
        printTable(
          [
            { header: "ID", key: "id", width: 12, transform: truncateId },
            { header: "Kind", key: "kind", width: 11 },
            { header: "Memory", key: "body", width: 50, transform: truncate(48) },
            { header: "Due", key: "due_at", transform: (v) => (v ? relativeDate(v) : "") },
            { header: "Status", key: "status", width: 6 },
          ],
          res.memories,
          opts as OutputOptions
        );
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  memory
    .command("add <text>")
    .description("Remember something for the next check-in")
    .option("--kind <kind>", "note, commitment or lesson", "note")
    .option("--ref <type:id>", "What it is about: gig:<id>, application:<id>, conversation:<id>, user:<id>")
    .option("--due <iso>", "When a commitment is due (ISO 8601)")
    .action(async (text: string, options) => {
      const opts = program.opts() as GlobalOpts;
      try {
        const [refType, refId] = options.ref ? String(options.ref).split(":", 2) : [undefined, undefined];
        const res = await createClient(opts).post<{ memory: { id: string } }>("/api/runner/memory", {
          kind: options.kind,
          body: text,
          ref_type: refType ?? null,
          ref_id: refId ?? null,
          due_at: options.due ? new Date(options.due).toISOString() : null,
        });
        if (opts.json) console.log(JSON.stringify(res, null, 2));
        else printSuccess(`Remembered (${res.memory.id}).`, opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  memory
    .command("done <id>")
    .description("Mark a memory or commitment done")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        await createClient(opts).patch(`/api/runner/memory/${id}`, { status: "done" });
        printSuccess("Marked done.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });

  memory
    .command("rm <id>")
    .description("Forget a memory")
    .action(async (id: string) => {
      const opts = program.opts() as GlobalOpts;
      try {
        await createClient(opts).delete(`/api/runner/memory/${id}`);
        printSuccess("Forgotten.", opts as OutputOptions);
      } catch (err) {
        handleError(err, opts as OutputOptions);
      }
    });
}
