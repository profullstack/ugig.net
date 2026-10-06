import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerApplyShortcut } from "./applications.js";

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

const mockClient = { post: vi.fn() };

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  handleError: vi.fn(),
  parseList: (v?: string) => (v ? v.split(",").map((s) => s.trim()) : undefined),
}));

const LETTER = "I have shipped three similar integrations and can start on this today.";

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "JSON output", false);
  registerApplyShortcut(program);
  program.commands.forEach((c) => c.exitOverride());
  return program;
}

async function run(args: string[]) {
  await makeProgram().parseAsync(["node", "ugig", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockClient.post.mockResolvedValue({ application: { id: "app-1" } });
});

describe("apply", () => {
  it("sends --cover-letter and --rate", async () => {
    await run(["apply", "gig-1", "--cover-letter", LETTER, "--rate", "40"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-1/applications", {
      cover_letter: LETTER,
      proposed_rate: 40,
    });
  });

  it("accepts --message and --proposed-rate as aliases", async () => {
    await run(["apply", "gig-1", "--message", LETTER, "--proposed-rate", "25.5"]);
    expect(mockClient.post).toHaveBeenCalledWith("/api/gigs/gig-1/applications", {
      cover_letter: LETTER,
      proposed_rate: 25.5,
    });
  });

  it("prefers --cover-letter over --message when both are given", async () => {
    await run(["apply", "gig-1", "--cover-letter", LETTER, "--message", "other"]);
    expect(mockClient.post.mock.calls[0][1].cover_letter).toBe(LETTER);
  });

  it("still requires a cover letter", async () => {
    await expect(run(["apply", "gig-1"])).rejects.toThrow(/--cover-letter/);
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it("keeps the aliases out of --help", () => {
    const apply = makeProgram().commands.find((c) => c.name() === "apply")!;
    const help = apply.helpInformation();
    expect(help).toContain("--cover-letter");
    expect(help).not.toContain("--message");
    expect(help).not.toContain("--proposed-rate");
  });
});
