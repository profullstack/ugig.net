import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPostCommands } from "./posts.js";

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
  put: vi.fn(),
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
  registerPostCommands(program);
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
//  post commands
// ════════════════════════════════════════════════════════════════════

describe("post create", () => {
  it("calls POST /api/posts with content", async () => {
    mockClient.post.mockResolvedValue({
      post: { id: "p1", content: "Hello world", tags: [], score: 0 },
    });

    await run(["post", "create", "Hello world"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/posts", {
      content: "Hello world",
      url: null,
      tags: [],
    });
  });

  it("passes url and tags when provided", async () => {
    mockClient.post.mockResolvedValue({
      post: {
        id: "p1",
        content: "Check this",
        url: "https://example.com",
        tags: ["tech", "news"],
        score: 0,
      },
    });

    await run([
      "post", "create", "Check this",
      "--url", "https://example.com",
      "--tags", "tech,news",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/posts", {
      content: "Check this",
      url: "https://example.com",
      tags: ["tech", "news"],
    });
  });

  it("outputs JSON when --json flag is set", async () => {
    mockClient.post.mockResolvedValue({
      post: { id: "p1", content: "Hello", tags: [], score: 0 },
    });

    await run(["--json", "post", "create", "Hello"]);

    expect(console.log).toHaveBeenCalled();
    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      }
    );
    expect(output).toBeDefined();
  });
});

describe("post get", () => {
  it("calls GET /api/posts/:id", async () => {
    mockClient.get.mockResolvedValue({
      post: {
        id: "p1",
        content: "Hello",
        author: { username: "test" },
        score: 5,
        upvotes: 5,
        downvotes: 0,
        views_count: 10,
        tags: [],
      },
    });

    await run(["post", "get", "p1"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/posts/p1");
  });
});

describe("post edit", () => {
  it("calls PUT /api/posts/:id with body", async () => {
    mockClient.put.mockResolvedValue({
      post: { id: "p1", content: "Updated", tags: ["new"] },
    });

    await run(["post", "edit", "p1", "--content", "Updated", "--tags", "new"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/posts/p1", {
      content: "Updated",
      tags: ["new"],
    });
  });

  it("sends only provided fields", async () => {
    mockClient.put.mockResolvedValue({
      post: { id: "p1", content: "Updated", tags: [] },
    });

    await run(["post", "edit", "p1", "--content", "Updated"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/posts/p1", {
      content: "Updated",
    });
  });
});

describe("post delete", () => {
  it("calls DELETE /api/posts/:id", async () => {
    mockClient.delete.mockResolvedValue({});

    await run(["post", "delete", "p1"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/posts/p1");
  });
});

describe("post upvote", () => {
  it("calls POST /api/posts/:id/upvote", async () => {
    mockClient.post.mockResolvedValue({ score: 5, user_vote: 1 });

    await run(["post", "upvote", "p1"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/posts/p1/upvote");
  });
});

describe("post downvote", () => {
  it("calls POST /api/posts/:id/downvote", async () => {
    mockClient.post.mockResolvedValue({ score: -1, user_vote: -1 });

    await run(["post", "downvote", "p1"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/posts/p1/downvote");
  });
});
