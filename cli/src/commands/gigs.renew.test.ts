import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerGigsCommands } from "./gigs.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("@inquirer/prompts", () => ({ select: vi.fn() }));

const mockClient = { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() };
const mockHandleError = vi.fn();

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: (...args: unknown[]) => mockHandleError(...args),
  parseList: (v: string) => v.split(","),
}));

async function run(args: string[]): Promise<void> {
  const program = new Command();
  program.option("--json", "JSON output", false);
  registerGigsCommands(program);
  await program.parseAsync(["node", "ugig", ...args]);
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gigs renew", () => {
  it("POSTs /api/gigs/:id/renew and reports the window", async () => {
    mockClient.post.mockResolvedValue({ gig: { expires_at: "2026-11-05T00:00:00Z" }, renewed_days: 30 });
    await run(["gigs", "renew", "gig-1"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-1/renew");
    expect(logSpy.mock.calls.flat().join(" ")).toContain("renewed for 30 days");
  });

  it("prints the raw result with --json", async () => {
    mockClient.post.mockResolvedValue({ gig: { expires_at: null }, renewed_days: 60 });
    await run(["--json", "gigs", "renew", "gig-1"]);
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toEqual({ gig: { expires_at: null }, renewed_days: 60 });
  });

  it("hands an API error (e.g. 429 ad cap) to handleError", async () => {
    const err = new Error("You already have 50 active for-hire ads");
    mockClient.post.mockRejectedValue(err);
    await run(["gigs", "renew", "gig-1"]);
    expect(mockHandleError).toHaveBeenCalledWith(err, expect.anything());
  });
});
