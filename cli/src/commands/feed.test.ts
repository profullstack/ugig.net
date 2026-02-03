import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerFeedCommands } from "./feed.js";

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
  registerFeedCommands(program);
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
//  feed command
// ════════════════════════════════════════════════════════════════════

describe("feed", () => {
  it("calls GET /api/feed with default params", async () => {
    mockClient.get.mockResolvedValue({
      posts: [
        {
          id: "p1",
          content: "Hello",
          score: 5,
          author: { username: "test" },
          tags: ["tech"],
          created_at: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, total: 1, totalPages: 1 },
    });

    await run(["feed"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/feed", {
      sort: "hot",
      tag: undefined,
      page: 1,
      limit: 20,
    });
  });

  it("passes sort, tag, page, and limit params", async () => {
    mockClient.get.mockResolvedValue({
      posts: [],
      pagination: { page: 2, total: 50, totalPages: 5 },
    });

    await run(["feed", "--sort", "new", "--tag", "rust", "--page", "2", "--limit", "10"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/feed", {
      sort: "new",
      tag: "rust",
      page: 2,
      limit: 10,
    });
  });

  it("outputs JSON when --json flag is set", async () => {
    mockClient.get.mockResolvedValue({
      posts: [
        {
          id: "p1",
          content: "Post",
          score: 1,
          author: { username: "user" },
          tags: [],
          created_at: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, total: 1, totalPages: 1 },
    });

    await run(["--json", "feed"]);

    expect(console.log).toHaveBeenCalled();
    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.data || parsed.posts || Array.isArray(parsed);
        } catch {
          return false;
        }
      }
    );
    expect(output).toBeDefined();
  });

  it("handles empty feed", async () => {
    mockClient.get.mockResolvedValue({
      posts: [],
      pagination: { page: 1, total: 0, totalPages: 0 },
    });

    // Should not throw
    await expect(run(["feed"])).resolves.toBeUndefined();
  });
});
