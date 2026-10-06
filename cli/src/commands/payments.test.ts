import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPaymentsCommands } from "./payments.js";
import { handleError } from "../helpers.js";

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
  registerPaymentsCommands(program);
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

describe("payments create", () => {
  it("calls POST /api/payments/coinpayportal/create for subscription", async () => {
    mockClient.post.mockResolvedValue({
      payment_id: "pay1",
      checkout_url: "https://example.com/pay",
      address: "0x123",
      amount_crypto: 9,
      currency: "usdc_pol",
      expires_at: "2025-01-01T00:00:00Z",
    });
    await run([
      "payments",
      "create",
      "--type",
      "subscription",
      "--currency",
      "usdc_pol",
      "--plan",
      "monthly",
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/payments/coinpayportal/create", {
      type: "subscription",
      currency: "usdc_pol",
      plan: "monthly",
    });
  });

  it("calls POST with amount for tip", async () => {
    mockClient.post.mockResolvedValue({
      payment_id: "pay2",
      checkout_url: "https://example.com/pay",
      address: "0x456",
      amount_crypto: 5,
      currency: "btc",
      expires_at: "2025-01-01T00:00:00Z",
    });
    await run(["payments", "create", "--type", "tip", "--currency", "btc", "--amount", "5"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/payments/coinpayportal/create", {
      type: "tip",
      currency: "btc",
      amount_usd: 5,
    });
  });

  it("rejects direct gig payments before calling the API", async () => {
    await run([
      "payments",
      "create",
      "--type",
      "gig_payment",
      "--currency",
      "btc",
      "--amount",
      "100",
    ]);

    expect(mockClient.post).not.toHaveBeenCalled();
    expect(handleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Gig payments must be paid through invoices. Use `ugig invoices create`.",
      }),
      expect.objectContaining({ json: false })
    );
  });
});

describe("payments status", () => {
  it("calls the real status route with payment_id", async () => {
    mockClient.get.mockResolvedValue({ status: "pending", updated_at: "2026-10-06T00:00:00Z" });
    await run(["payments", "status", "pay1"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/payments/coinpayportal/status", {
      payment_id: "pay1",
    });
  });
});
