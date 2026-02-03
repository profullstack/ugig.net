import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerEndorsementsCommands } from "./endorsements.js";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

const mockClient = {
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
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
  registerEndorsementsCommands(program);
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
//  endorsements commands
// ════════════════════════════════════════════════════════════════════

describe("endorsements", () => {
  it("calls GET /api/users/:username/endorsements", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        {
          skill: "TypeScript",
          count: 3,
          endorsers: [
            { id: "e1", username: "user1", full_name: "User One", comment: null, created_at: new Date().toISOString() },
          ],
        },
      ],
      total_endorsements: 3,
    });

    await run(["endorsements", "@testuser"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/users/testuser/endorsements",
      {}
    );
  });

  it("passes skill filter", async () => {
    mockClient.get.mockResolvedValue({
      data: [],
      total_endorsements: 0,
    });

    await run(["endorsements", "@testuser", "--skill", "Rust"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/users/testuser/endorsements",
      { skill: "Rust" }
    );
  });
});

describe("endorse", () => {
  it("calls POST /api/users/:username/endorse", async () => {
    mockClient.post.mockResolvedValue({ data: {} });

    await run(["endorse", "@testuser", "--skill", "TypeScript"]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/users/testuser/endorse",
      { skill: "TypeScript" }
    );
  });

  it("passes optional comment", async () => {
    mockClient.post.mockResolvedValue({ data: {} });

    await run([
      "endorse", "@testuser",
      "--skill", "TypeScript",
      "--comment", "Great developer",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/users/testuser/endorse",
      { skill: "TypeScript", comment: "Great developer" }
    );
  });
});

describe("unendorse", () => {
  it("calls DELETE /api/users/:username/endorse", async () => {
    mockClient.delete.mockResolvedValue({});

    await run(["unendorse", "@testuser", "--skill", "TypeScript"]);

    expect(mockClient.delete).toHaveBeenCalledWith(
      "/api/users/testuser/endorse?skill=TypeScript"
    );
  });
});
