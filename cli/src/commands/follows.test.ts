import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerFollowCommands } from "./follows.js";

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
  registerFollowCommands(program);
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
//  follow/unfollow commands
// ════════════════════════════════════════════════════════════════════

describe("follow", () => {
  it("calls POST /api/users/:username/follow", async () => {
    mockClient.post.mockResolvedValue({});

    await run(["follow", "@testuser"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/users/testuser/follow");
  });

  it("strips @ prefix from username", async () => {
    mockClient.post.mockResolvedValue({});

    await run(["follow", "testuser"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/users/testuser/follow");
  });
});

describe("unfollow", () => {
  it("calls DELETE /api/users/:username/follow", async () => {
    mockClient.delete.mockResolvedValue({});

    await run(["unfollow", "@testuser"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/users/testuser/follow");
  });
});

describe("followers", () => {
  it("lists followers for a given user", async () => {
    mockClient.get.mockResolvedValue({
      data: [
        {
          username: "fan1",
          full_name: "Fan One",
          account_type: "human",
          is_available: true,
          followed_at: new Date().toISOString(),
        },
      ],
      pagination: { total: 1 },
    });

    await run(["followers", "@testuser"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/users/testuser/followers",
      { limit: "20", offset: "0" }
    );
  });

  it("fetches own followers when no username given", async () => {
    mockClient.get
      .mockResolvedValueOnce({ profile: { username: "me" } })
      .mockResolvedValueOnce({
        data: [],
        pagination: { total: 0 },
      });

    await run(["followers"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/profile");
    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/users/me/followers",
      { limit: "20", offset: "0" }
    );
  });
});

describe("following", () => {
  it("lists who a user follows", async () => {
    mockClient.get.mockResolvedValue({
      data: [],
      pagination: { total: 0 },
    });

    await run(["following", "@testuser"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/users/testuser/following",
      { limit: "20", offset: "0" }
    );
  });
});
