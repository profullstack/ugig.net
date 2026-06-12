import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerInvoicesCommands } from "./invoices.js";

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
  registerInvoicesCommands(program);
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

describe("invoices list", () => {
  it("calls GET /api/gigs/:id/invoice", async () => {
    mockClient.get.mockResolvedValue({ data: [] });
    await run(["invoices", "list", "gig-123"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/gigs/gig-123/invoice");
  });
});

describe("invoices create", () => {
  it("calls POST /api/gigs/:id/invoice", async () => {
    mockClient.post.mockResolvedValue({
      data: {
        invoice_id: "inv1",
        coinpay_invoice_id: "cp1",
        pay_url: "https://example.com/pay",
      },
    });
    await run([
      "invoices", "create", "gig-123",
      "--application-id", "app-456",
      "--amount", "100",
      "--payment-currency", "usdc_pol",
      "--wallet-address", "0xabc",
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-123/invoice", {
      application_id: "app-456",
      amount: 100,
      currency: "USD",
      payment_currency: "usdc_pol",
      merchant_wallet_address: "0xabc",
    });
  });

  it("includes optional notes and due-date", async () => {
    mockClient.post.mockResolvedValue({
      data: { invoice_id: "inv2", coinpay_invoice_id: "cp2", pay_url: "https://example.com/pay" },
    });
    await run([
      "invoices", "create", "gig-123",
      "--application-id", "app-456",
      "--amount", "50",
      "--payment-currency", "btc",
      "--wallet-address", "bc1qabc",
      "--notes", "First milestone",
      "--due-date", "2025-06-01",
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-123/invoice", {
      application_id: "app-456",
      amount: 50,
      currency: "USD",
      payment_currency: "btc",
      merchant_wallet_address: "bc1qabc",
      notes: "First milestone",
      due_date: "2025-06-01",
    });
  });

  it("sends line items and PR links", async () => {
    mockClient.post.mockResolvedValue({
      data: { invoice_id: "inv3", coinpay_invoice_id: null, pay_url: null },
    });
    const searchUrl = "https://github.com/org/repo/pulls?q=is:pr+is:merged+author:you";
    await run([
      "invoices", "create", "gig-123",
      "--application-id", "app-456",
      "--item", `Pull requests|8|1|${searchUrl}`,
      "--item", "Code review|1|25",
      "--pr-links", `${searchUrl},https://github.com/org/repo/pull/42`,
      "--payment-currency", "usdc_pol",
      "--wallet-address", "0xabc",
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-123/invoice", {
      application_id: "app-456",
      currency: "USD",
      payment_currency: "usdc_pol",
      merchant_wallet_address: "0xabc",
      items: [
        { description: "Pull requests", quantity: 8, unit_price: 1, link: searchUrl },
        { description: "Code review", quantity: 1, unit_price: 25 },
      ],
      pr_links: [searchUrl, "https://github.com/org/repo/pull/42"],
    });
  });
});
