import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerInvitesCommands } from "./invites.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

const mockClient = { post: vi.fn(), get: vi.fn(), delete: vi.fn() };

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: vi.fn(),
}));

async function run(args: string[]): Promise<void> {
  const program = new Command();
  program.option("--json", "JSON output", false).option("--api-key <key>", "API key");
  registerInvitesCommands(program);
  await program.parseAsync(["node", "ugig", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("redeem / invites", () => {
  it("redeems a credit code", async () => {
    mockClient.post.mockResolvedValue({ granted: { unit: "pro_days", amount: 30 }, current_period_end: "2026-12-01T00:00:00Z" });
    await run(["redeem", "CR-AAAA-BBBB-CCCC-DDDD"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/credits/redeem", { code: "CR-AAAA-BBBB-CCCC-DDDD" });
  });

  it("lists invites by default", async () => {
    mockClient.get.mockResolvedValue({
      quota: { total: 3, used: 1, left: 2 },
      invites: [{ id: "inv_1", status: "open", note: "", createdAt: Date.now() }],
      canInvite: true,
      unlocksAt: null,
      bonusDays: 7,
      referral: { code: "me", link: "https://ugig.net/?ref=me" },
    });
    await run(["invites"]);
    expect(mockClient.get).toHaveBeenCalledWith("/api/invites");
  });

  it("creates, accepts and revokes", async () => {
    mockClient.post.mockResolvedValueOnce({ invite: { code: "INV-1", url: "u", id: "i" } });
    await run(["invites", "create", "--note", "for Carol"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/invites", { note: "for Carol" });

    mockClient.post.mockResolvedValueOnce({ message: "ok" });
    await run(["invites", "accept", "INV-1"]);
    expect(mockClient.post).toHaveBeenLastCalledWith("/api/invites/accept", { code: "INV-1" });

    mockClient.delete.mockResolvedValueOnce({ ok: true });
    await run(["invites", "revoke", "inv_1"]);
    expect(mockClient.delete).toHaveBeenCalledWith("/api/invites/inv_1");
  });
});
