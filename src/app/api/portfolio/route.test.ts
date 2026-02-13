import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { portfolioItemSchema, portfolioItemUpdateSchema } from "@/lib/validations";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();

const supabaseClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onPortfolioAdded: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import type { AuthContext } from "@/lib/auth/get-user";
const mockGetAuthContext = vi.mocked(getAuthContext);

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
  url?: string,
) {
  const requestUrl = url || "http://localhost/api/portfolio";
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(requestUrl, init);
}

/** Build a chainable Supabase query mock that resolves to `result`. */
function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "single", "order"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods resolve to the result
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (chain.order as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  return chain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════
//  GET /api/portfolio?user_id=<id>
// ════════════════════════════════════════════════════════════════════

describe("GET /api/portfolio", () => {
  it("returns 400 when user_id query parameter is missing", async () => {
    const res = await GET(makeRequest("GET"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("user_id query parameter is required");
  });

  it("returns portfolio items for a user", async () => {
    const items = [
      { id: "item-1", title: "Project Alpha", tags: ["react"], gig: null },
      { id: "item-2", title: "Project Beta", tags: ["node"], gig: null },
    ];
    const chain = chainResult({ data: items, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await GET(
      makeRequest("GET", undefined, "http://localhost/api/portfolio?user_id=user-123"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.portfolio_items).toEqual(items);
    expect(mockFrom).toHaveBeenCalledWith("portfolio_items");
  });

  it("includes linked gig title when gig_id is present", async () => {
    const items = [
      {
        id: "item-1",
        title: "Website Redesign",
        gig: { id: "gig-1", title: "Build Landing Page" },
      },
    ];
    const chain = chainResult({ data: items, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await GET(
      makeRequest("GET", undefined, "http://localhost/api/portfolio?user_id=user-123"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.portfolio_items).toHaveLength(1);
    expect(json.portfolio_items[0].gig).toEqual({ id: "gig-1", title: "Build Landing Page" });
  });

  it("returns empty array when user has no portfolio items", async () => {
    const chain = chainResult({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const res = await GET(
      makeRequest("GET", undefined, "http://localhost/api/portfolio?user_id=user-no-items"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.portfolio_items).toEqual([]);
  });

  it("returns 400 on database error", async () => {
    const chain = chainResult({ data: null, error: { message: "relation does not exist" } });
    mockFrom.mockReturnValue(chain);

    const res = await GET(
      makeRequest("GET", undefined, "http://localhost/api/portfolio?user_id=user-123"),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("relation does not exist");
  });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/portfolio
// ════════════════════════════════════════════════════════════════════

describe("POST /api/portfolio", () => {
  const userId = "user-123";
  const authContext = {
    user: { id: userId, email: "test@example.com", authMethod: "session" as const },
    supabase: supabaseClient,
  } as unknown as AuthContext;

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(makeRequest("POST", { title: "My Project" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("creates a portfolio item with title, description, and tags", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const createdItem = {
      id: "new-item-id",
      user_id: userId,
      title: "My Portfolio Project",
      description: "A detailed description of my work",
      tags: ["react", "typescript"],
      url: null,
      image_url: null,
      gig_id: null,
      gig: null,
    };
    const chain = chainResult({ data: createdItem, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(
      makeRequest("POST", {
        title: "My Portfolio Project",
        description: "A detailed description of my work",
        tags: ["react", "typescript"],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.portfolio_item).toEqual(createdItem);
    expect(mockFrom).toHaveBeenCalledWith("portfolio_items");
  });

  it("creates a portfolio item with only a title (minimum required)", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const createdItem = {
      id: "minimal-item",
      user_id: userId,
      title: "Minimal Item",
      tags: [],
      gig: null,
    };
    const chain = chainResult({ data: createdItem, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest("POST", { title: "Minimal Item" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.portfolio_item).toEqual(createdItem);
  });

  it("validates required fields — rejects missing title", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { description: "No title here" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("validates required fields — rejects empty title", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(makeRequest("POST", { title: "" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Title is required");
  });

  it("validates title max length", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { title: "x".repeat(201) }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("validates url format", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const res = await POST(
      makeRequest("POST", { title: "Valid Title", url: "not-a-url" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it("accepts empty string for url (cleaned to null)", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const createdItem = { id: "item-1", title: "With URL", url: null, gig: null };
    const chain = chainResult({ data: createdItem, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(
      makeRequest("POST", { title: "With URL", url: "" }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
  });

  it("returns 400 on database error", async () => {
    mockGetAuthContext.mockResolvedValue(authContext);

    const chain = chainResult({ data: null, error: { message: "insert failed" } });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest("POST", { title: "Valid Title" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("insert failed");
  });
});

// ════════════════════════════════════════════════════════════════════
//  Portfolio validation schemas (unit tests)
// ════════════════════════════════════════════════════════════════════

describe("portfolioItemSchema", () => {
  it("accepts valid full input", () => {
    const result = portfolioItemSchema.safeParse({
      title: "My Project",
      description: "A detailed description",
      url: "https://example.com",
      image_url: "https://example.com/image.png",
      tags: ["react", "node"],
      gig_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal input (title only)", () => {
    const result = portfolioItemSchema.safeParse({ title: "X" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]); // default
    }
  });

  it("rejects missing title", () => {
    const result = portfolioItemSchema.safeParse({ description: "No title" });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = portfolioItemSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Title is required");
    }
  });

  it("rejects title over 200 characters", () => {
    const result = portfolioItemSchema.safeParse({ title: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid url format", () => {
    const result = portfolioItemSchema.safeParse({ title: "T", url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts empty string for url", () => {
    const result = portfolioItemSchema.safeParse({ title: "T", url: "" });
    expect(result.success).toBe(true);
  });

  it("accepts null for url", () => {
    const result = portfolioItemSchema.safeParse({ title: "T", url: null });
    expect(result.success).toBe(true);
  });

  it("rejects invalid image_url format", () => {
    const result = portfolioItemSchema.safeParse({ title: "T", image_url: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid gig_id (not a UUID)", () => {
    const result = portfolioItemSchema.safeParse({ title: "T", gig_id: "not-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts valid UUID for gig_id", () => {
    const result = portfolioItemSchema.safeParse({
      title: "T",
      gig_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 10 tags", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    const result = portfolioItemSchema.safeParse({ title: "T", tags });
    expect(result.success).toBe(false);
  });

  it("rejects tag longer than 50 characters", () => {
    const result = portfolioItemSchema.safeParse({ title: "T", tags: ["x".repeat(51)] });
    expect(result.success).toBe(false);
  });

  it("rejects description over 2000 characters", () => {
    const result = portfolioItemSchema.safeParse({
      title: "T",
      description: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe("portfolioItemUpdateSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = portfolioItemUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only title", () => {
    const result = portfolioItemUpdateSchema.safeParse({ title: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only tags", () => {
    const result = portfolioItemUpdateSchema.safeParse({ tags: ["new-tag"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty title when provided", () => {
    const result = portfolioItemUpdateSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects title over 200 characters when provided", () => {
    const result = portfolioItemUpdateSchema.safeParse({ title: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid url when provided", () => {
    const result = portfolioItemUpdateSchema.safeParse({ url: "not-valid" });
    expect(result.success).toBe(false);
  });
});
