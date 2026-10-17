import { describe, it, expect } from "vitest";
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
  CRON_TAG,
  type WakeDigest,
} from "./core.js";

const digest: WakeDigest = {
  runner_id: "r1",
  status: "active",
  since: "2026-10-17T00:00:00.000Z",
  now: "2026-10-17T01:00:00.000Z",
  has_news: true,
  agent: { username: "pixelsmith", agent_name: "Pixelsmith", skills: ["rust", "wasm"], rate: "40 USD hourly" },
  budget: { applications_left_today: 2, applications_cap: 3 },
  notifications: [],
  unread_messages: [{ conversation_id: "c1", content: "Can you start Monday?" }],
  application_updates: [],
  matching_gigs: [{ id: "g1", title: "Port a parser to WASM" }],
  commitments: [],
  memories: [],
  hints: [],
};

const spec = {
  node: "/usr/bin/node",
  script: "/home/a/.ugig-cli/cli/dist/index.js",
  intervalMinutes: 60,
  path: "/home/a/.local/bin:/usr/bin",
  logFile: "/home/a/.ugig/runner.log",
};

describe("buildPrompt", () => {
  it("states the budget, the priorities and the result line", () => {
    const p = buildPrompt(digest, 60);
    expect(p).toContain("@pixelsmith");
    expect(p).toContain("at most 3 applications in any 24 hours (2 left right now)");
    expect(p).toContain("If nothing needs you, do nothing");
    expect(p).toContain('UGIG_TICK {"outcome"');
    expect(p).toContain("Can you start Monday?");
    expect(p.indexOf("Answer people")).toBeLessThan(p.indexOf("look at the new gigs"));
  });

  it("only names CLI commands that exist", () => {
    const p = buildPrompt(digest, 60);
    expect(p).toContain('ugig apply <gig-id> --cover-letter "..." --rate <n> --timeline "..."');
    expect(p).toContain('ugig messages send <conversation-id> --content "..."');
    expect(p).not.toContain("--message");
  });
});

describe("parseTickLine", () => {
  it("reads the last UGIG_TICK line", () => {
    const out = [
      "thinking...",
      'UGIG_TICK {"outcome":"idle","summary":"draft"}',
      "more output",
      'UGIG_TICK {"outcome":"acted","summary":"Replied to c1","actions":[{"type":"reply","ref":"conversation:c1"}]}',
    ].join("\n");
    expect(parseTickLine(out)).toEqual({
      outcome: "acted",
      summary: "Replied to c1",
      actions: [{ type: "reply", ref: "conversation:c1" }],
    });
  });

  it("skips malformed lines and falls back to an error tick", () => {
    expect(parseTickLine("UGIG_TICK {not json")).toMatchObject({ outcome: "error" });
    expect(parseTickLine("no marker at all")).toMatchObject({ outcome: "error" });
  });

  it("drops junk actions and never reports an unknown outcome", () => {
    const r = parseTickLine('UGIG_TICK {"outcome":"spam","actions":[{"type":"apply"},null,{"x":1}]}');
    expect(r.outcome).toBe("acted");
    expect(r.actions).toEqual([{ type: "apply" }]);
  });
});

describe("harnessCommand", () => {
  it("limits Claude Code to the ugig CLI", () => {
    const { cmd, args } = harnessCommand("claude");
    expect(cmd).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("Bash(ugig:*)");
  });

  it("gives Codex network access but a workspace sandbox, prompt on stdin", () => {
    const { cmd, args } = harnessCommand("codex");
    expect(cmd).toBe("codex");
    expect(args.slice(0, 1)).toEqual(["exec"]);
    expect(args).toContain("workspace-write");
    expect(args[args.length - 1]).toBe("-");
  });
});

describe("scheduler files", () => {
  it("systemd: oneshot service plus a persistent timer at the interval", () => {
    expect(systemdService(spec)).toContain("ExecStart=/usr/bin/node /home/a/.ugig-cli/cli/dist/index.js runner tick");
    expect(systemdService(spec)).toContain("Environment=PATH=/home/a/.local/bin:/usr/bin");
    expect(systemdTimer(spec)).toContain("OnUnitActiveSec=60min");
    expect(systemdTimer(spec)).toContain("Persistent=true");
  });

  it("systemd quotes paths with spaces", () => {
    expect(systemdService({ ...spec, script: "/Users/a b/ugig.js" })).toContain('"/Users/a b/ugig.js" runner tick');
  });

  it("launchd: StartInterval in seconds", () => {
    expect(launchdPlist(spec)).toContain("<integer>3600</integer>");
    expect(launchdPlist(spec)).toContain("<string>tick</string>");
  });

  it("cron: maps intervals to fields it can express", () => {
    expect(cronLine({ ...spec, intervalMinutes: 30 })).toMatch(/^\*\/30 \* \* \* \* /);
    expect(cronLine({ ...spec, intervalMinutes: 120 })).toMatch(/^0 \*\/2 \* \* \* /);
    expect(cronLine(spec)).toContain(CRON_TAG);
  });

  it("mergeCrontab replaces our line and keeps everyone else's", () => {
    const existing = `0 5 * * * backup.sh\n*/30 * * * * old ${CRON_TAG}\n`;
    expect(mergeCrontab(existing, `new ${CRON_TAG}`)).toBe(`0 5 * * * backup.sh\nnew ${CRON_TAG}\n`);
    expect(mergeCrontab(existing, null)).toBe("0 5 * * * backup.sh\n");
  });
});

describe("resolveIdPrefix", () => {
  const ids = ["fcdffa44-1111-4111-8111-111111111111", "fcdf0000-2222-4222-8222-222222222222", "abcd1234-3333-4333-8333-333333333333"];

  it("resolves the truncated id `memory list` prints", () => {
    expect(resolveIdPrefix("fcdffa44..", ids)).toBe(ids[0]);
    expect(resolveIdPrefix("ABCD", ids)).toBe(ids[2]);
  });

  it("passes a full UUID through without a lookup", () => {
    expect(resolveIdPrefix("99999999-9999-4999-8999-999999999999", [])).toBe("99999999-9999-4999-8999-999999999999");
  });

  it("refuses ambiguous, unknown, short and empty ids", () => {
    expect(() => resolveIdPrefix("fcdf", ids)).toThrow(/matches 2/);
    expect(() => resolveIdPrefix("zzzz", ids)).toThrow(/No memory/);
    expect(() => resolveIdPrefix("ab", ids)).toThrow(/at least/);
    expect(() => resolveIdPrefix("", ids)).toThrow(/at least/);
  });
});

describe("parseInterval", () => {
  it("accepts minutes and hours", () => {
    expect(parseInterval("60")).toBe(60);
    expect(parseInterval("30m")).toBe(30);
    expect(parseInterval("2h")).toBe(120);
  });

  it("refuses intervals the server would reject", () => {
    expect(() => parseInterval("5m")).toThrow();
    expect(() => parseInterval("25h")).toThrow();
    expect(() => parseInterval("soon")).toThrow();
  });
});
