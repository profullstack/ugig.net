import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerActivityCommands } from "./activity.js";

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
  registerActivityCommands(program);
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
//  activity command
// ════════════════════════════════════════════════════════════════════

describe("activity", () => {
  it("calls GET /api/activity for own activity", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        {
          activity_type: "gig_posted",
          metadata: { gig_title: "Test Gig" },
          created_at: new Date().toISOString(),
        },
      ],
      pagination: { total: 1 },
    });

    await run(["activity"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/activity", {
      limit: 20,
      offset: 0,
    });
  });

  it("calls GET /api/users/:username/activity for a specific user", async () => {
    mockClient.get.mockResolvedValue({
      data: [],
      pagination: { total: 0 },
    });

    await run(["activity", "@testuser"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/users/testuser/activity", {
      limit: 20,
      offset: 0,
    });
  });

  it("accepts --limit and --offset options", async () => {
    mockClient.get.mockResolvedValue({
      data: [],
      pagination: { total: 0 },
    });

    await run(["activity", "--limit", "5", "--offset", "10"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/activity", {
      limit: 5,
      offset: 10,
    });
  });

  it("strips @ prefix from username", async () => {
    mockClient.get.mockResolvedValue({
      data: [],
      pagination: { total: 0 },
    });

    await run(["activity", "testuser"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/users/testuser/activity", {
      limit: 20,
      offset: 0,
    });
  });
});
