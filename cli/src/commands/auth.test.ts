import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerAuthCommands } from "./auth.js";
import { ApiError } from "../errors.js";

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
};

const mockHandleError = vi.fn();
const mockPrintError = vi.fn();

vi.mock("../helpers.js", () => ({
  createClient: vi.fn(() => mockClient),
  createUnauthClient: vi.fn(() => mockClient),
  handleError: (...args: unknown[]) => mockHandleError(...args),
}));

vi.mock("../output.js", () => ({
  printDetail: vi.fn(),
  printSuccess: vi.fn(),
  printError: (...args: unknown[]) => mockPrintError(...args),
}));

function createProgram(): Command {
  const program = new Command();
  program.option("--json", "JSON output");
  program.option("--api-key <key>", "API key");
  program.option("--base-url <url>", "Base URL");
  registerAuthCommands(program);
  program.exitOverride(); // prevent process.exit
  return program;
}

describe("CLI auth commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  describe("signup", () => {
    it("should call POST /api/auth/signup with correct body", async () => {
      mockClient.post.mockResolvedValue({ message: "Check your email" });
      const program = createProgram();
      await program.parseAsync([
        "node", "ugig",
        "auth", "signup",
        "--email", "test@example.com",
        "--password", "MyPass123",
        "--username", "testuser",
      ]);
      expect(mockClient.post).toHaveBeenCalledWith("/api/auth/signup", {
        email: "test@example.com",
        password: "MyPass123",
        username: "testuser",
        account_type: "human",
      });
    });
  });

  describe("login", () => {
    it("should call POST /api/auth/login", async () => {
      mockClient.post.mockResolvedValue({ message: "Login successful" });
      const program = createProgram();
      await program.parseAsync([
        "node", "ugig",
        "auth", "login",
        "--email", "test@example.com",
        "--password", "MyPass123",
      ]);
      expect(mockClient.post).toHaveBeenCalledWith("/api/auth/login", {
        email: "test@example.com",
        password: "MyPass123",
      });
    });

    it("should show email confirmation error with resend hint", async () => {
      mockClient.post.mockRejectedValue(
        new ApiError(403, {
          error: "Please confirm your email before logging in.",
          code: "EMAIL_NOT_CONFIRMED",
        })
      );
      const program = createProgram();
      await program.parseAsync([
        "node", "ugig",
        "auth", "login",
        "--email", "unconfirmed@example.com",
        "--password", "MyPass123",
      ]);
      expect(mockPrintError).toHaveBeenCalled();
      const errorMsg = mockPrintError.mock.calls[0][0] as string;
      expect(errorMsg).toContain("confirm your email");
      expect(errorMsg).toContain("resend-confirmation");
      expect(mockHandleError).not.toHaveBeenCalled();
    });

    it("should call handleError for other errors", async () => {
      mockClient.post.mockRejectedValue(
        new ApiError(401, { error: "Invalid login credentials" })
      );
      const program = createProgram();
      await program.parseAsync([
        "node", "ugig",
        "auth", "login",
        "--email", "test@example.com",
        "--password", "wrong",
      ]);
      expect(mockHandleError).toHaveBeenCalled();
      expect(mockPrintError).not.toHaveBeenCalled();
    });
  });

  describe("resend-confirmation", () => {
    it("should call POST /api/auth/resend-confirmation", async () => {
      mockClient.post.mockResolvedValue({ message: "Confirmation link sent." });
      const program = createProgram();
      await program.parseAsync([
        "node", "ugig",
        "auth", "resend-confirmation",
        "--email", "test@example.com",
      ]);
      expect(mockClient.post).toHaveBeenCalledWith(
        "/api/auth/resend-confirmation",
        { email: "test@example.com" }
      );
    });

    it("should handle errors gracefully", async () => {
      mockClient.post.mockRejectedValue(
        new ApiError(429, { error: "Rate limited" })
      );
      const program = createProgram();
      await program.parseAsync([
        "node", "ugig",
        "auth", "resend-confirmation",
        "--email", "test@example.com",
      ]);
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe("whoami", () => {
    it("should call GET /api/profile", async () => {
      mockClient.get.mockResolvedValue({
        profile: { username: "testuser", email: "test@example.com" },
      });
      const program = createProgram();
      await program.parseAsync(["node", "ugig", "auth", "whoami"]);
      expect(mockClient.get).toHaveBeenCalledWith("/api/profile");
    });
  });
});
