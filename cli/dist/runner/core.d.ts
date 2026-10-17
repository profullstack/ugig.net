/**
 * Pure pieces of `ugig runner`: the check-in prompt, the result line the
 * harness prints, and the scheduler files. No I/O here, so it is all tested.
 */
export type Harness = "claude" | "codex";
export type TickOutcome = "acted" | "idle" | "error";
export type WakeDigest = {
    runner_id: string;
    status: "active" | "paused" | "retired";
    since: string;
    now: string;
    has_news: boolean;
    agent: {
        username: string;
        agent_name: string | null;
        skills: string[];
        rate: string | null;
    };
    budget: {
        applications_left_today: number;
        applications_cap: number;
    };
    notifications: unknown[];
    unread_messages: unknown[];
    application_updates: unknown[];
    matching_gigs: unknown[];
    commitments: unknown[];
    memories: unknown[];
    hints: string[];
};
export type TickResult = {
    outcome: TickOutcome;
    summary: string | null;
    actions: {
        type: string;
        ref?: string;
    }[];
};
export declare const TICK_MARKER = "UGIG_TICK";
/**
 * The check-in prompt. Restraint is the point: buyers trust residents because
 * they reply, deliver and apply rarely, so "nothing to do" is a good outcome.
 */
export declare function buildPrompt(digest: WakeDigest, intervalMinutes: number): string;
/**
 * Find the harness's result line. The last UGIG_TICK line wins; if there is
 * none the model ran but did not report, which is an error tick.
 */
export declare function parseTickLine(output: string): TickResult;
/** argv for one headless harness run; the prompt goes on stdin. */
export declare function harnessCommand(harness: Harness): {
    cmd: string;
    args: string[];
};
export type ScheduleSpec = {
    /** Absolute path of the node binary. */
    node: string;
    /** Absolute path of the ugig CLI entry script. */
    script: string;
    intervalMinutes: number;
    /** PATH the harness needs (claude/codex are usually under ~/.local/bin or a node prefix). */
    path: string;
    logFile: string;
};
export declare const SYSTEMD_UNIT = "ugig-runner";
export declare const LAUNCHD_LABEL = "net.ugig.runner";
export declare const CRON_TAG = "# ugig-runner";
export declare function systemdService(spec: ScheduleSpec): string;
export declare function systemdTimer(spec: ScheduleSpec): string;
export declare function launchdPlist(spec: ScheduleSpec): string;
/** One crontab line; cron cannot do "every 90 minutes", so it rounds to a field it can. */
export declare function cronLine(spec: ScheduleSpec): string;
/** Replace any earlier ugig-runner line in a crontab, or remove it when `line` is null. */
export declare function mergeCrontab(existing: string, line: string | null): string;
/**
 * `memory list` shows ids truncated ("fcdffa44.."), so `done`/`rm` accept any
 * unique prefix of one. A full UUID is used as given.
 */
export declare function resolveIdPrefix(input: string, ids: string[]): string;
/** "every 2h", "30m", "90" → minutes, clamped to what the server accepts. */
export declare function parseInterval(value: string): number;
