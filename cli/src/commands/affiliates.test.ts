import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerAffiliatesCommands } from "./affiliates.js";

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
  patch: vi.fn(),
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
  registerAffiliatesCommands(program);
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

describe("affiliates list", () => {
  it("calls GET /api/affiliates/offers", async () => {
    mockClient.get.mockResolvedValue({ offers: [], total: 0 });
    await run(["affiliates", "list"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/affiliates/offers", {
      category: undefined,
      tag: undefined,
      q: undefined,
      sort: undefined,
      page: "1",
    });
  });

  it("passes search and category filters", async () => {
    mockClient.get.mockResolvedValue({ offers: [], total: 0 });
    await run(["affiliates", "list", "--search", "test", "--category", "dev"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/affiliates/offers", {
      category: "dev",
      tag: undefined,
      q: "test",
      sort: undefined,
      page: "1",
    });
  });
});

describe("affiliates view", () => {
  it("calls GET /api/affiliates/offers/:id", async () => {
    mockClient.get.mockResolvedValue({ offer: { id: "abc", title: "Test" } });
    await run(["affiliates", "view", "abc"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/affiliates/offers/abc");
  });
});

describe("affiliates create", () => {
  it("calls POST /api/affiliates/offers", async () => {
    mockClient.post.mockResolvedValue({ offer: { id: "abc", title: "Test", slug: "test" } });
    await run([
      "affiliates", "create",
      "--title", "Test Offer",
      "--description", "A test",
      "--commission-rate", "10",
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/affiliates/offers", {
      title: "Test Offer",
      description: "A test",
      commission_rate: 10,
      commission_type: "percentage",
    });
  });
});

describe("affiliates update", () => {
  it("calls PATCH /api/affiliates/offers/:id", async () => {
    mockClient.patch.mockResolvedValue({ offer: { id: "abc", title: "Updated" } });
    await run(["affiliates", "update", "abc", "--title", "Updated"]);
    expect(mockClient.patch).toHaveBeenCalledWith("/api/affiliates/offers/abc", {
      title: "Updated",
    });
  });
});

describe("affiliates mine", () => {
  it("calls GET /api/affiliates/my", async () => {
    mockClient.get.mockResolvedValue({ view: "affiliate", applications: [] });
    await run(["affiliates", "mine"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/affiliates/my", { view: "affiliate" });
  });
});

describe("affiliates apply", () => {
  it("calls POST /api/affiliates/offers/:id/apply", async () => {
    mockClient.post.mockResolvedValue({ application: { id: "app1", status: "pending" } });
    await run(["affiliates", "apply", "abc"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/affiliates/offers/abc/apply", {});
  });
});

describe("affiliates conversions", () => {
  it("calls GET /api/affiliates/offers/:id/conversions", async () => {
    mockClient.get.mockResolvedValue({ conversions: [] });
    await run(["affiliates", "conversions", "abc"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/affiliates/offers/abc/conversions");
  });
});
