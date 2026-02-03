import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerCommentsCommands } from "./comments.js";

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
  registerCommentsCommands(program);
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
//  comments commands
// ════════════════════════════════════════════════════════════════════

describe("comments list", () => {
  it("calls GET /api/gigs/:id/comments", async () => {
    mockClient.get.mockResolvedValue({
      comments: [
        {
          id: "c1",
          content: "Question?",
          author: { full_name: "Test User", username: "test" },
          created_at: new Date().toISOString(),
          replies: [],
        },
      ],
      total: 1,
    });

    await run(["comments", "list", "gig-1"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/gigs/gig-1/comments");
  });
});

describe("comments create", () => {
  it("calls POST /api/gigs/:id/comments with content", async () => {
    mockClient.post.mockResolvedValue({ comment: { id: "c1" } });

    await run(["comments", "create", "gig-1", "--content", "Is this available?"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-1/comments", {
      content: "Is this available?",
    });
  });

  it("passes parent-id for replies", async () => {
    mockClient.post.mockResolvedValue({ comment: { id: "c2" } });

    await run([
      "comments", "create", "gig-1",
      "--content", "Reply",
      "--parent-id", "c1",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-1/comments", {
      content: "Reply",
      parent_id: "c1",
    });
  });
});

describe("comments update", () => {
  it("calls PUT /api/gigs/:gigId/comments/:commentId", async () => {
    mockClient.put.mockResolvedValue({});

    await run(["comments", "update", "gig-1", "c1", "--content", "Updated"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/gigs/gig-1/comments/c1", {
      content: "Updated",
    });
  });
});

describe("comments delete", () => {
  it("calls DELETE /api/gigs/:gigId/comments/:commentId", async () => {
    mockClient.delete.mockResolvedValue({});

    await run(["comments", "delete", "gig-1", "c1"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/gigs/gig-1/comments/c1");
  });
});
