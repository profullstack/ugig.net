import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerMcpCommands } from "./mcp.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

const mockClient = {
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: vi.fn(),
}));

function makeProgram(): Command {
  const program = new Command();
  program
    .option("--json", "JSON output", false)
    .option("--api-key <key>", "API key")
    .option("--base-url <url>", "Base URL");
  registerMcpCommands(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = makeProgram();
  await program.parseAsync(["node", "ugig", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("mcp list", () => {
  it("lists active MCP servers", async () => {
    mockClient.get.mockResolvedValue({
      listings: [
        {
          slug: "test-mcp",
          title: "Test MCP",
          transport_type: "sse",
          price_sats: 100,
          rating_avg: 4.5,
          downloads_count: 10,
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    await run(["mcp", "list"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/mcp", expect.objectContaining({}));
  });

  it("passes search params", async () => {
    mockClient.get.mockResolvedValue({ listings: [], total: 0 });

    await run(["mcp", "list", "--search", "automation", "--category", "coding"]);

    expect(mockClient.get).toHaveBeenCalledWith(
      "/api/mcp",
      expect.objectContaining({
        search: "automation",
        category: "coding",
      }),
    );
  });
});

describe("mcp view", () => {
  it("gets MCP server by slug", async () => {
    mockClient.get.mockResolvedValue({
      listing: { slug: "my-mcp", title: "My MCP" },
      purchased: false,
    });

    await run(["mcp", "view", "my-mcp"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/mcp/my-mcp");
  });
});

describe("mcp create", () => {
  it("creates an MCP server listing", async () => {
    mockClient.post.mockResolvedValue({
      listing: { slug: "my-mcp", title: "My MCP" },
    });

    await run([
      "mcp",
      "create",
      "--title",
      "My MCP",
      "--description",
      "A test MCP server",
      "--price",
      "500",
      "--category",
      "coding",
      "--server-url",
      "https://mcp.example.com",
      "--transport",
      "sse",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/mcp",
      expect.objectContaining({
        title: "My MCP",
        description: "A test MCP server",
        price_sats: 500,
        category: "coding",
        mcp_server_url: "https://mcp.example.com",
        transport_type: "sse",
      }),
    );
  });

  it("passes supported tools", async () => {
    mockClient.post.mockResolvedValue({
      listing: { slug: "my-mcp", title: "My MCP" },
    });

    await run([
      "mcp",
      "create",
      "--title",
      "My MCP",
      "--description",
      "A test MCP server",
      "--tools",
      "search,fetch,analyze",
    ]);

    expect(mockClient.post).toHaveBeenCalledWith(
      "/api/mcp",
      expect.objectContaining({
        supported_tools: ["search", "fetch", "analyze"],
      }),
    );
  });
});

describe("mcp update", () => {
  it("updates an MCP server listing", async () => {
    mockClient.patch.mockResolvedValue({
      listing: { slug: "my-mcp", title: "Updated" },
    });

    await run(["mcp", "update", "my-mcp", "--title", "Updated", "--status", "active"]);

    expect(mockClient.patch).toHaveBeenCalledWith(
      "/api/mcp/my-mcp",
      expect.objectContaining({
        title: "Updated",
        status: "active",
      }),
    );
  });

  it("passes server-url and transport on update", async () => {
    mockClient.patch.mockResolvedValue({
      listing: { slug: "my-mcp" },
    });

    await run([
      "mcp",
      "update",
      "my-mcp",
      "--server-url",
      "https://new-mcp.example.com",
      "--transport",
      "streamable-http",
    ]);

    expect(mockClient.patch).toHaveBeenCalledWith(
      "/api/mcp/my-mcp",
      expect.objectContaining({
        mcp_server_url: "https://new-mcp.example.com",
        transport_type: "streamable-http",
      }),
    );
  });
});

describe("mcp delete", () => {
  it("archives an MCP server listing", async () => {
    mockClient.delete.mockResolvedValue({ ok: true });

    await run(["mcp", "delete", "my-mcp"]);

    expect(mockClient.delete).toHaveBeenCalledWith("/api/mcp/my-mcp");
  });
});

describe("mcp mine", () => {
  it("lists own MCP server listings", async () => {
    mockClient.get.mockResolvedValue({ listings: [] });

    await run(["mcp", "mine"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/mcp/my");
  });
});

describe("mcp vote", () => {
  it("upvotes an MCP server", async () => {
    mockClient.post.mockResolvedValue({ upvotes: 1, downvotes: 0, score: 1, user_vote: 1 });

    await run(["mcp", "vote", "my-mcp"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/mcp/my-mcp/vote", { vote_type: 1 });
  });
});

describe("mcp unvote", () => {
  it("removes vote from an MCP server", async () => {
    mockClient.post.mockResolvedValue({ upvotes: 0, downvotes: 0, score: 0, user_vote: null });

    await run(["mcp", "unvote", "my-mcp"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/mcp/my-mcp/vote", { vote_type: 1 });
  });
});

describe("mcp purchase", () => {
  it("purchases an MCP server", async () => {
    mockClient.post.mockResolvedValue({
      ok: true,
      purchase_id: "abc123",
      fee_sats: 50,
      fee_rate: 0.1,
      new_balance: 950,
    });

    await run(["mcp", "purchase", "my-mcp"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/mcp/my-mcp/purchase", {});
  });
});

describe("mcp library", () => {
  it("lists purchased MCP servers", async () => {
    mockClient.get.mockResolvedValue({ purchases: [] });

    await run(["mcp", "library"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/mcp/library");
  });
});

describe("mcp connect", () => {
  it("gets connection info", async () => {
    mockClient.post.mockResolvedValue({
      mcp_server_url: "https://mcp.example.com",
      transport_type: "sse",
      supported_tools: ["search"],
      title: "My MCP",
    });

    await run(["mcp", "connect", "my-mcp"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/mcp/my-mcp/download", {});
  });
});

describe("mcp reviews", () => {
  it("lists reviews for an MCP server", async () => {
    mockClient.get.mockResolvedValue({ reviews: [] });

    await run(["mcp", "reviews", "my-mcp"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/mcp/my-mcp/reviews");
  });
});

describe("mcp review", () => {
  it("submits a review", async () => {
    mockClient.post.mockResolvedValue({
      review: { rating: 5, comment: "Great!" },
    });

    await run(["mcp", "review", "my-mcp", "--rating", "5", "--comment", "Great!"]);

    expect(mockClient.post).toHaveBeenCalledWith("/api/mcp/my-mcp/reviews", {
      rating: 5,
      comment: "Great!",
    });
  });
});
