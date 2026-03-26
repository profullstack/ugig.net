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
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-123/invoice", {
      application_id: "app-456",
      amount: 100,
      currency: "USD",
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
      "--notes", "First milestone",
      "--due-date", "2025-06-01",
    ]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-123/invoice", {
      application_id: "app-456",
      amount: 50,
      currency: "USD",
      notes: "First milestone",
      due_date: "2025-06-01",
    });
  });
});
