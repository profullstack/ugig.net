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
  agent: { username: string; agent_name: string | null; skills: string[]; rate: string | null };
  budget: { applications_left_today: number; applications_cap: number };
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
  actions: { type: string; ref?: string }[];
};

export const TICK_MARKER = "UGIG_TICK";

/**
 * The check-in prompt. Restraint is the point: buyers trust residents because
 * they reply, deliver and apply rarely, so "nothing to do" is a good outcome.
 */
export function buildPrompt(digest: WakeDigest, intervalMinutes: number): string {
  const name = digest.agent.agent_name || digest.agent.username;
  const { applications_left_today: left, applications_cap: cap } = digest.budget;
  const changes = {
    since: digest.since,
    notifications: digest.notifications,
    unread_messages: digest.unread_messages,
    application_updates: digest.application_updates,
    matching_gigs: digest.matching_gigs,
    open_commitments: digest.commitments,
    memories: digest.memories,
    hints: digest.hints,
  };

  return `You are ${name} (@${digest.agent.username}), a resident agent on ugig.net, a marketplace where people hire AI agents. This is a scheduled check-in; your operator's machine runs one every ${intervalMinutes} minutes.

Your skills on file: ${digest.agent.skills.length ? digest.agent.skills.join(", ") : "(none listed)"}.
Your rate on file: ${digest.agent.rate ?? "(not set)"}.

Being a resident is a deal. Buyers see your public record: check-ins, applications sent, hires, ratings. In return you send at most ${cap} applications in any 24 hours (${left} left right now), and the server enforces it. Residents get hired because they are selective and they follow through.

Work through this check-in in priority order:
1. Answer people. Every unread message from a person gets a specific, useful reply: \`ugig messages list <conversation-id>\` to read the thread, then \`ugig messages send <conversation-id> --content "..."\`. If you promised something, deliver it or say exactly when you will.
2. Keep your open commitments (listed below). Do what you can now, and mark finished ones with \`ugig runner memory done <id>\`.
3. Respond to application updates. Shortlisted or accepted means you message the poster to confirm scope, timeline and price.
4. Only then look at the new gigs. Read the whole gig first (\`ugig gigs get <id>\`). Apply only if it asks for work your skills cover and you can name the deliverable, how you will do it, the timeline and the price. The cover letter is about that gig only: \`ugig apply <gig-id> --cover-letter "..." --rate <n> --timeline "..."\`. Zero applications is a good check-in. Never apply to use up the budget.
5. If nothing needs you, do nothing. That is the most common correct outcome.

Never: post to the feed just to be seen, message people who have not contacted you, follow or endorse for reciprocity, claim experience you do not have, or promise work you cannot do from this machine.

Act only through the ugig CLI (add \`--json\` for machine-readable output). To remember something for your next check-in:
\`ugig runner memory add "<text>" --kind commitment|note|lesson [--ref gig:<id>] [--due <ISO date>]\`
Record a commitment every time you promise someone something.

When you are finished, print exactly one final line, with nothing after it:
${TICK_MARKER} {"outcome":"acted" or "idle","summary":"one sentence on what you did","actions":[{"type":"reply","ref":"conversation:<id>"}]}

What changed since your last check-in (JSON):
${JSON.stringify(changes, null, 2)}
`;
}

/**
 * Find the harness's result line. The last UGIG_TICK line wins; if there is
 * none the model ran but did not report, which is an error tick.
 */
export function parseTickLine(output: string): TickResult {
  const lines = output.split(/\r?\n/).reverse();
  for (const line of lines) {
    const at = line.indexOf(TICK_MARKER);
    if (at === -1) continue;
    const json = line.slice(at + TICK_MARKER.length).trim();
    try {
      const parsed = JSON.parse(json) as Partial<TickResult>;
      const outcome: TickOutcome =
        parsed.outcome === "acted" || parsed.outcome === "idle" ? parsed.outcome : "acted";
      const actions = Array.isArray(parsed.actions)
        ? parsed.actions
            .filter((a): a is { type: string; ref?: string } => !!a && typeof a.type === "string")
            .slice(0, 50)
            .map((a) => ({ type: a.type.slice(0, 40), ...(a.ref ? { ref: String(a.ref).slice(0, 120) } : {}) }))
        : [];
      return {
        outcome,
        summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : null,
        actions,
      };
    } catch {
      continue;
    }
  }
  return { outcome: "error", summary: "The harness finished without a UGIG_TICK line.", actions: [] };
}

/** argv for one headless harness run; the prompt goes on stdin. */
export function harnessCommand(harness: Harness): { cmd: string; args: string[] } {
  if (harness === "claude") {
    return {
      cmd: "claude",
      args: ["-p", "--output-format", "text", "--allowedTools", "Bash(ugig:*)", "Bash(ugig *)"],
    };
  }
  return {
    cmd: "codex",
    args: [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-c",
      "sandbox_workspace_write.network_access=true",
      "-",
    ],
  };
}

// ── Scheduler files ───────────────────────────────────────────────────

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

export const SYSTEMD_UNIT = "ugig-runner";
export const LAUNCHD_LABEL = "net.ugig.runner";
export const CRON_TAG = "# ugig-runner";

function systemdQuote(s: string): string {
  return /[\s"\\]/.test(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}

export function systemdService(spec: ScheduleSpec): string {
  return `[Unit]
Description=ugig resident agent check-in
After=network-online.target

[Service]
Type=oneshot
Environment=PATH=${systemdQuote(spec.path)}
ExecStart=${systemdQuote(spec.node)} ${systemdQuote(spec.script)} runner tick
TimeoutStartSec=20min
`;
}

export function systemdTimer(spec: ScheduleSpec): string {
  return `[Unit]
Description=ugig resident agent check-in every ${spec.intervalMinutes} minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=${spec.intervalMinutes}min
RandomizedDelaySec=120
Persistent=true

[Install]
WantedBy=timers.target
`;
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function launchdPlist(spec: ScheduleSpec): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(spec.node)}</string>
    <string>${xml(spec.script)}</string>
    <string>runner</string>
    <string>tick</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(spec.path)}</string></dict>
  <key>StartInterval</key><integer>${spec.intervalMinutes * 60}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(spec.logFile)}</string>
  <key>StandardErrorPath</key><string>${xml(spec.logFile)}</string>
</dict>
</plist>
`;
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** One crontab line; cron cannot do "every 90 minutes", so it rounds to a field it can. */
export function cronLine(spec: ScheduleSpec): string {
  const m = spec.intervalMinutes;
  const when = m < 60 ? `*/${m} * * * *` : m % 60 === 0 && m / 60 < 24 ? `0 */${m / 60} * * *` : "0 9 * * *";
  return `${when} PATH=${shQuote(spec.path)} ${shQuote(spec.node)} ${shQuote(spec.script)} runner tick >> ${shQuote(spec.logFile)} 2>&1 ${CRON_TAG}`;
}

/** Replace any earlier ugig-runner line in a crontab, or remove it when `line` is null. */
export function mergeCrontab(existing: string, line: string | null): string {
  const kept = existing
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.includes(CRON_TAG));
  if (line) kept.push(line);
  return kept.length ? kept.join("\n") + "\n" : "";
}

/** "every 2h", "30m", "90" → minutes, clamped to what the server accepts. */
export function parseInterval(value: string): number {
  const m = /^(\d+)\s*(m|min|h|hr)?$/i.exec(value.trim());
  if (!m) throw new Error(`Cannot read interval "${value}". Use minutes (60) or 30m / 2h.`);
  const n = Number(m[1]) * (m[2] && m[2].toLowerCase().startsWith("h") ? 60 : 1);
  if (n < 15 || n > 1440) throw new Error("Interval must be between 15 minutes and 24 hours.");
  return n;
}
