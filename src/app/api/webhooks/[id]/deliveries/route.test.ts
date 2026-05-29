import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockGetAuthContext = vi.fn();

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: mockGetAuthContext,
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/webhooks/webhook-1/deliveries");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

function chainResult(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "single", "order", "range"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single.mockResolvedValue({
    data: { id: "webhook-1", user_id: "user-1" },
    error: null,
  });
  chain.range.mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthContext.mockResolvedValue({
    user: { id: "user-1" },
    supabase: { from: mockFrom },
  });
});

describe("GET /api/webhooks/[id]/deliveries", () => {
  it("applies default pagination", async () => {
    const webhookChain = chainResult({ data: null, error: null });
    const deliveriesChain = chainResult({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValueOnce(webhookChain).mockReturnValueOnce(deliveriesChain);

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "webhook-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(deliveriesChain.range).toHaveBeenCalledWith(0, 49);
    expect(json.pagination).toEqual({ total: 0, limit: 50, offset: 0 });
  });

  it("clamps invalid pagination params before applying range", async () => {
    const webhookChain = chainResult({ data: null, error: null });
    const deliveriesChain = chainResult({ data: [], error: null, count: 12 });
    mockFrom.mockReturnValueOnce(webhookChain).mockReturnValueOnce(deliveriesChain);

    const res = await GET(makeRequest({ limit: "abc", offset: "-5" }), {
      params: Promise.resolve({ id: "webhook-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(deliveriesChain.range).toHaveBeenCalledWith(0, 49);
    expect(json.pagination).toEqual({ total: 12, limit: 50, offset: 0 });
  });

  it("uses defaults for empty pagination params", async () => {
    const webhookChain = chainResult({ data: null, error: null });
    const deliveriesChain = chainResult({ data: [], error: null, count: 3 });
    mockFrom.mockReturnValueOnce(webhookChain).mockReturnValueOnce(deliveriesChain);

    const res = await GET(makeRequest({ limit: "", offset: "" }), {
      params: Promise.resolve({ id: "webhook-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(deliveriesChain.range).toHaveBeenCalledWith(0, 49);
    expect(json.pagination).toEqual({ total: 3, limit: 50, offset: 0 });
  });

  it("truncates fractional pagination params and caps high limits", async () => {
    const webhookChain = chainResult({ data: null, error: null });
    const deliveriesChain = chainResult({ data: [], error: null, count: 200 });
    mockFrom.mockReturnValueOnce(webhookChain).mockReturnValueOnce(deliveriesChain);

    const res = await GET(makeRequest({ limit: "250.9", offset: "3.8" }), {
      params: Promise.resolve({ id: "webhook-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(deliveriesChain.range).toHaveBeenCalledWith(3, 102);
    expect(json.pagination).toEqual({ total: 200, limit: 100, offset: 3 });
  });
});
