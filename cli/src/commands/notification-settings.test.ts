import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerNotificationSettingsCommands } from "./notification-settings.js";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("chalk", () => ({
  default: {
    bold: vi.fn((s: string) => s),
    dim: vi.fn((s: string) => s),
    green: vi.fn((s: string) => s),
    red: vi.fn((s: string) => s),
  },
}));

const mockClient = {
  get: vi.fn(),
  put: vi.fn(),
};

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program
    .option("--json", "JSON output", false)
    .option("--api-key <key>", "API key")
    .option("--base-url <url>", "Base URL");
  registerNotificationSettingsCommands(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = makeProgram();
  await program.parseAsync(["node", "ugig", ...args]);
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ════════════════════════════════════════════════════════════════════

describe("notification-settings view", () => {
  it("calls GET /api/notification-settings", async () => {
    mockClient.get.mockResolvedValue({
      data: {
        email_new_message: true,
        email_new_comment: true,
        email_new_follower: false,
      },
    });
    await run(["notification-settings", "view"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/notification-settings");
  });
});

describe("notification-settings update", () => {
  it("calls PUT /api/notification-settings with boolean flags", async () => {
    mockClient.put.mockResolvedValue({
      data: {
        email_new_message: false,
        email_gig_updates: true,
      },
    });
    await run([
      "notification-settings", "update",
      "--email-new-message", "false",
      "--email-gig-updates", "true",
    ]);
    expect(mockClient.put).toHaveBeenCalledWith("/api/notification-settings", {
      email_new_message: false,
      email_gig_updates: true,
    });
  });

  it("shows message when no settings provided", async () => {
    await run(["notification-settings", "update"]);
    expect(mockClient.put).not.toHaveBeenCalled();
  });
});
