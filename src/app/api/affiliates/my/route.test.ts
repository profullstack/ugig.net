import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function chainable(data: unknown, error: unknown = null) {
  const result = { data, error };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "data") return data;
      if (prop === "error") return error;
      return () => new Proxy(result, handler);
    },
  };
  return new Proxy(result, handler);
}

describe("GET /api/affiliates/my", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds shareable tracking URLs to approved affiliate applications", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ugig.net";
    mockGetAuthContext.mockResolvedValue({
      user: { id: "user-affiliate", authMethod: "session" },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "affiliate_applications") {
        return chainable([
          {
            id: "app-approved",
            status: "approved",
            tracking_code: "alice-abc123",
            affiliate_offers: { title: "Demo offer" },
          },
          {
            id: "app-pending",
            status: "pending",
            tracking_code: "alice-def456",
            affiliate_offers: { title: "Pending offer" },
          },
        ]);
      }
      if (table === "affiliate_conversions" || table === "affiliate_clicks") {
        return chainable([]);
      }
      return chainable([]);
    });

    const response = await GET(new NextRequest("http://localhost/api/affiliates/my"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.applications[0].tracking_url).toBe("https://ugig.net/ref/alice-abc123");
    expect(body.applications[1].tracking_url).toBeNull();
  });
});
