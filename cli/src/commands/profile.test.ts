import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerProfileCommands } from "./profile.js";

// ── Mocks ──────────────────────────────────────────────────────────

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
  delete: vi.fn(),
  uploadFile: vi.fn(),
};

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: vi.fn(),
  parseList: vi.fn((v: string) => v?.split(",").map((s: string) => s.trim()).filter(Boolean)),
}));

const { mockExistsSync, mockReadFileSync, fsMock } = vi.hoisted(() => {
  const mockExistsSync = vi.fn(() => true);
  const mockReadFileSync = vi.fn(() => Buffer.from("fake-image-data"));
  const fsMock = {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    default: {
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
    },
  };
  return { mockExistsSync, mockReadFileSync, fsMock };
});

vi.mock("node:fs", () => fsMock);
vi.mock("fs", () => fsMock);

// ── Helpers ────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program
    .option("--json", "JSON output", false)
    .option("--api-key <key>", "API key")
    .option("--base-url <url>", "Base URL");
  registerProfileCommands(program);
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
//  profile get
// ════════════════════════════════════════════════════════════════════

describe("profile get", () => {
  it("calls GET /api/profile", async () => {
    mockClient.get.mockResolvedValue({
      profile: {
        id: "u1",
        username: "testuser",
        full_name: "Test User",
        bio: "Hello",
        skills: ["TypeScript"],
        ai_tools: ["GPT-4"],
        hourly_rate: 50,
        is_available: true,
      },
    });

    await run(["profile", "get"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/profile");
  });
});

// ════════════════════════════════════════════════════════════════════
//  profile update
// ════════════════════════════════════════════════════════════════════

describe("profile update", () => {
  it("fetches current profile and updates with new values", async () => {
    mockClient.get.mockResolvedValue({
      profile: {
        username: "testuser",
        full_name: "Old Name",
        bio: "Old bio",
        skills: ["JavaScript"],
      },
    });
    mockClient.put.mockResolvedValue({});

    await run(["profile", "update", "--full-name", "New Name", "--bio", "New bio"]);

    expect(mockClient.get).toHaveBeenCalledWith("/api/profile");
    expect(mockClient.put).toHaveBeenCalledWith("/api/profile", expect.objectContaining({
      full_name: "New Name",
      bio: "New bio",
    }));
  });

  it("updates skills as array", async () => {
    mockClient.get.mockResolvedValue({ profile: { username: "test" } });
    mockClient.put.mockResolvedValue({});

    await run(["profile", "update", "--skills", "TypeScript,React,Node.js"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/profile", expect.objectContaining({
      skills: ["TypeScript", "React", "Node.js"],
    }));
  });

  it("updates ai-tools as array", async () => {
    mockClient.get.mockResolvedValue({ profile: { username: "test" } });
    mockClient.put.mockResolvedValue({});

    await run(["profile", "update", "--ai-tools", "GPT-4,Claude"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/profile", expect.objectContaining({
      ai_tools: ["GPT-4", "Claude"],
    }));
  });

  it("updates hourly rate as number", async () => {
    mockClient.get.mockResolvedValue({ profile: { username: "test" } });
    mockClient.put.mockResolvedValue({});

    await run(["profile", "update", "--hourly-rate", "75"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/profile", expect.objectContaining({
      hourly_rate: 75,
    }));
  });

  it("updates availability", async () => {
    mockClient.get.mockResolvedValue({ profile: { username: "test" } });
    mockClient.put.mockResolvedValue({});

    await run(["profile", "update", "--available", "true"]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/profile", expect.objectContaining({
      is_available: true,
    }));
  });

  it("updates agent fields", async () => {
    mockClient.get.mockResolvedValue({ profile: { username: "test" } });
    mockClient.put.mockResolvedValue({});

    await run([
      "profile", "update",
      "--agent-name", "MyBot",
      "--agent-description", "A helpful bot",
      "--agent-version", "1.0.0",
    ]);

    expect(mockClient.put).toHaveBeenCalledWith("/api/profile", expect.objectContaining({
      agent_name: "MyBot",
      agent_description: "A helpful bot",
      agent_version: "1.0.0",
    }));
  });
});

// ════════════════════════════════════════════════════════════════════
//  profile avatar
// ════════════════════════════════════════════════════════════════════

describe("profile avatar", () => {
  it("uploads file to /api/profile/avatar", async () => {
    mockClient.uploadFile.mockResolvedValue({
      avatar_url: "https://example.com/avatar.png",
    });

    await run(["profile", "avatar", "/path/to/avatar.png"]);

    expect(mockClient.uploadFile).toHaveBeenCalledWith(
      "/api/profile/avatar",
      expect.any(Buffer),
      "avatar.png",
      "image/png"
    );
  });

  it("handles jpeg files", async () => {
    mockClient.uploadFile.mockResolvedValue({
      avatar_url: "https://example.com/avatar.jpg",
    });

    await run(["profile", "avatar", "/path/to/photo.jpg"]);

    expect(mockClient.uploadFile).toHaveBeenCalledWith(
      "/api/profile/avatar",
      expect.any(Buffer),
      "photo.jpg",
      "image/jpeg"
    );
  });

  it("handles webp files", async () => {
    mockClient.uploadFile.mockResolvedValue({
      avatar_url: "https://example.com/avatar.webp",
    });

    await run(["profile", "avatar", "/path/to/image.webp"]);

    expect(mockClient.uploadFile).toHaveBeenCalledWith(
      "/api/profile/avatar",
      expect.any(Buffer),
      "image.webp",
      "image/webp"
    );
  });

  it("handles gif files", async () => {
    mockClient.uploadFile.mockResolvedValue({
      avatar_url: "https://example.com/avatar.gif",
    });

    await run(["profile", "avatar", "/path/to/animated.gif"]);

    expect(mockClient.uploadFile).toHaveBeenCalledWith(
      "/api/profile/avatar",
      expect.any(Buffer),
      "animated.gif",
      "image/gif"
    );
  });

  it("outputs avatar URL on success", async () => {
    mockClient.uploadFile.mockResolvedValue({
      avatar_url: "https://example.com/avatar.png",
    });

    await run(["profile", "avatar", "/path/to/avatar.png"]);

    expect(console.log).toHaveBeenCalledWith("Avatar URL: https://example.com/avatar.png");
  });

  it("outputs JSON when --json flag is set", async () => {
    mockClient.uploadFile.mockResolvedValue({
      avatar_url: "https://example.com/avatar.png",
    });

    await run(["--json", "profile", "avatar", "/path/to/avatar.png"]);

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ avatar_url: "https://example.com/avatar.png" }, null, 2)
    );
  });
});

// ════════════════════════════════════════════════════════════════════
//  profile banner
// ════════════════════════════════════════════════════════════════════

describe("profile banner", () => {
  it("uploads file to /api/profile/banner", async () => {
    mockClient.uploadFile.mockResolvedValue({
      banner_url: "https://example.com/banner.png",
    });

    await run(["profile", "banner", "/path/to/banner.png"]);

    expect(mockClient.uploadFile).toHaveBeenCalledWith(
      "/api/profile/banner",
      expect.any(Buffer),
      "banner.png",
      "image/png"
    );
  });

  it("handles jpeg files", async () => {
    mockClient.uploadFile.mockResolvedValue({
      banner_url: "https://example.com/banner.jpg",
    });

    await run(["profile", "banner", "/path/to/banner.jpeg"]);

    expect(mockClient.uploadFile).toHaveBeenCalledWith(
      "/api/profile/banner",
      expect.any(Buffer),
      "banner.jpeg",
      "image/jpeg"
    );
  });

  it("outputs banner URL on success", async () => {
    mockClient.uploadFile.mockResolvedValue({
      banner_url: "https://example.com/banner.png",
    });

    await run(["profile", "banner", "/path/to/banner.png"]);

    expect(console.log).toHaveBeenCalledWith("Banner URL: https://example.com/banner.png");
  });

  it("outputs JSON when --json flag is set", async () => {
    mockClient.uploadFile.mockResolvedValue({
      banner_url: "https://example.com/banner.png",
    });

    await run(["--json", "profile", "banner", "/path/to/banner.png"]);

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ banner_url: "https://example.com/banner.png" }, null, 2)
    );
  });
});

// ════════════════════════════════════════════════════════════════════
//  error handling
// ════════════════════════════════════════════════════════════════════

describe("error handling", () => {
  it("handles file not found for avatar", async () => {
    mockExistsSync.mockReturnValue(false);

    const { handleError } = await import("../helpers.js");

    await run(["profile", "avatar", "/nonexistent/file.png"]);

    expect(handleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "File not found: /nonexistent/file.png" }),
      expect.any(Object)
    );
    
    // Reset mock
    mockExistsSync.mockReturnValue(true);
  });

  it("handles file not found for banner", async () => {
    mockExistsSync.mockReturnValue(false);

    const { handleError } = await import("../helpers.js");

    await run(["profile", "banner", "/nonexistent/file.png"]);

    expect(handleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "File not found: /nonexistent/file.png" }),
      expect.any(Object)
    );
    
    // Reset mock
    mockExistsSync.mockReturnValue(true);
  });

  it("handles invalid file type for avatar", async () => {
    const { handleError } = await import("../helpers.js");

    await run(["profile", "avatar", "/path/to/file.txt"]);

    expect(handleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" }),
      expect.any(Object)
    );
  });

  it("handles invalid file type for banner", async () => {
    const { handleError } = await import("../helpers.js");

    await run(["profile", "banner", "/path/to/file.pdf"]);

    expect(handleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" }),
      expect.any(Object)
    );
  });

  it("handles API errors for profile get", async () => {
    mockClient.get.mockRejectedValue(new Error("Unauthorized"));

    const { handleError } = await import("../helpers.js");

    await run(["profile", "get"]);

    expect(handleError).toHaveBeenCalled();
  });

  it("handles API errors for profile update", async () => {
    mockClient.get.mockResolvedValue({ profile: {} });
    mockClient.put.mockRejectedValue(new Error("Bad request"));

    const { handleError } = await import("../helpers.js");

    await run(["profile", "update", "--bio", "test"]);

    expect(handleError).toHaveBeenCalled();
  });

  it("handles API errors for avatar upload", async () => {
    mockClient.uploadFile.mockRejectedValue(new Error("Upload failed"));

    const { handleError } = await import("../helpers.js");

    await run(["profile", "avatar", "/path/to/avatar.png"]);

    expect(handleError).toHaveBeenCalled();
  });

  it("handles API errors for banner upload", async () => {
    mockClient.uploadFile.mockRejectedValue(new Error("Upload failed"));

    const { handleError } = await import("../helpers.js");

    await run(["profile", "banner", "/path/to/banner.png"]);

    expect(handleError).toHaveBeenCalled();
  });
});
