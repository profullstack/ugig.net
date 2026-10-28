import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerWebhooksCommands } from "./webhooks.js";

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
  registerWebhooksCommands(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  await makeProgram().parseAsync(["node", "ugig", ...args]);
}

const logged = () => (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(" ")).join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("webhooks list", () => {
  it("lists endpoints from /api/v1/webhooks", async () => {
    mockClient.get.mockResolvedValue({ endpoints: [{ id: "wh_1", url: "https://example.com/hook", events: ["gig.update"], enabled: true, created_at: new Date().toISOString() }], event_types: [] });
    await run(["webhooks", "list"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/v1/webhooks");
  });
});

describe("webhooks create", () => {
  it("creates an endpoint and prints the secret", async () => {
    mockClient.post.mockResolvedValue({ endpoint: { id: "wh_new" }, secret: "whsec_abc" });
    await run(["webhooks", "create", "--url", "https://example.com/hook", "--events", "gig.update,message.new", "--description", "ci"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/v1/webhooks", {
      url: "https://example.com/hook",
      events: ["gig.update", "message.new"],
      description: "ci",
    });
    expect(mockClient.patch).not.toHaveBeenCalled();
    expect(logged()).toContain("whsec_abc");
  });

  it("defaults to every event and can create it paused", async () => {
    mockClient.post.mockResolvedValue({ endpoint: { id: "wh_new" }, secret: "whsec_abc" });
    mockClient.patch.mockResolvedValue({ id: "wh_new", enabled: false });
    await run(["webhooks", "create", "--url", "https://example.com/hook", "--inactive"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/v1/webhooks", { url: "https://example.com/hook", events: ["*"] });
    expect(mockClient.patch).toHaveBeenCalledWith("/api/v1/webhooks/wh_new", { enabled: false });
  });

  it("handles errors", async () => {
    const { handleError } = await import("../helpers.js");
    mockClient.post.mockRejectedValue(new Error("fail"));
    await run(["webhooks", "create", "--url", "https://bad.com", "--events", "x"]);
    expect(handleError).toHaveBeenCalled();
  });
});

describe("webhooks update / delete", () => {
  it("patches the endpoint", async () => {
    mockClient.patch.mockResolvedValue({});
    await run(["webhooks", "update", "wh_1", "--url", "https://new.com", "--inactive"]);
    expect(mockClient.patch).toHaveBeenCalledWith("/api/v1/webhooks/wh_1", { url: "https://new.com", enabled: false });
  });

  it("deletes the endpoint", async () => {
    mockClient.delete.mockResolvedValue({ deleted: true });
    await run(["webhooks", "delete", "wh_1"]);
    expect(mockClient.delete).toHaveBeenCalledWith("/api/v1/webhooks/wh_1");
  });
});

describe("webhooks test / secret / rotate / deliveries / retry", () => {
  it("sends a test", async () => {
    mockClient.post.mockResolvedValue({ ok: true, status: 204, error: null });
    await run(["webhooks", "test", "wh_1"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/v1/webhooks/wh_1/test");
  });

  it("shows and rotates the secret", async () => {
    mockClient.get.mockResolvedValue({ secret: "whsec_old" });
    await run(["webhooks", "secret", "wh_1"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/v1/webhooks/wh_1/secret");
    mockClient.post.mockResolvedValue({ secret: "whsec_new" });
    await run(["webhooks", "rotate", "wh_1"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/v1/webhooks/wh_1/rotate");
    expect(logged()).toContain("whsec_new");
  });

  it("lists deliveries for one endpoint or all, and retries one", async () => {
    mockClient.get.mockResolvedValue({ deliveries: [] });
    await run(["webhooks", "deliveries", "wh_1", "--limit", "5"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/v1/webhooks/wh_1/deliveries", { limit: "5" });
    await run(["webhooks", "deliveries"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/v1/webhooks/deliveries", { limit: "20" });
    mockClient.post.mockResolvedValue({});
    await run(["webhooks", "retry", "dlv_1"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/v1/webhooks/deliveries/dlv_1/retry");
  });
});
