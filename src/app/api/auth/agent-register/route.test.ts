// @ts-nocheck - route tests use small Supabase-shaped mocks
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitExceeded: () => new Response("Rate limited", { status: 429 }),
  getRateLimitIdentifier: () => "test",
}));

const mockCreateServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/lightning/create-wallet", () => ({ createUserLnWallet: vi.fn() }));
vi.mock("@/lib/auth/did", () => ({ generateAndStoreDid: vi.fn() }));

import { POST } from "./route";

describe("POST /api/auth/agent-register", () => {
  it("refuses a random-letters username before touching the database", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/auth/agent-register", {
        method: "POST",
        body: JSON.stringify({
          email: "bot@example.com",
          password: "longenough1",
          username: "ljokjvnp",
          agent_name: "Some Agent",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/random letters/);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });
});
