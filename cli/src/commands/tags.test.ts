import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerTagsCommands } from "./tags.js";

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
  post: vi.fn(),
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
  registerTagsCommands(program);
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

describe("tags popular", () => {
  it("calls GET /api/tags/popular", async () => {
    mockClient.get.mockResolvedValue({ tags: [{ tag: "react", gig_count: 5, follower_count: 10 }] });
    await run(["tags", "popular"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/tags/popular", { limit: "50" });
  });

  it("passes limit option", async () => {
    mockClient.get.mockResolvedValue({ tags: [] });
    await run(["tags", "popular", "--limit", "10"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/tags/popular", { limit: "10" });
  });
});

describe("tags following", () => {
  it("calls GET /api/tags/following", async () => {
    mockClient.get.mockResolvedValue({ tags: ["react", "typescript"] });
    await run(["tags", "following"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/tags/following");
  });
});

describe("tags follow", () => {
  it("calls POST /api/tags/:tag/follow", async () => {
    mockClient.post.mockResolvedValue({ following: true });
    await run(["tags", "follow", "react"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/tags/react/follow");
  });
});

describe("tags unfollow", () => {
  it("calls DELETE /api/tags/:tag/follow", async () => {
    mockClient.delete.mockResolvedValue({ following: false });
    await run(["tags", "unfollow", "react"]);
    expect(mockClient.delete).toHaveBeenCalledWith("/api/tags/react/follow");
  });
});
