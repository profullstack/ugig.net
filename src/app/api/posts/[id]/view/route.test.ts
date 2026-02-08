import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockRpc = vi.fn();

const supabaseClient = {
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseClient)),
}));

import { POST } from "./route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest() {
  return new NextRequest("http://localhost/api/posts/post-1/view", {
    method: "POST",
  });
}

function makeParams(id = "post-1") {
  return { params: Promise.resolve({ id }) };
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("POST /api/posts/[id]/view", () => {
  it("increments view count successfully", async () => {
    mockRpc.mockResolvedValue({ error: null });

    const res = await POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("increment_post_views", {
      post_id: "post-1",
    });
  });

  it("calls increment_post_views RPC for each view", async () => {
    mockRpc.mockResolvedValue({ error: null });

    await POST(makeRequest(), makeParams());
    await POST(makeRequest(), makeParams());

    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("returns error when RPC fails", async () => {
    mockRpc.mockResolvedValue({ error: { message: "Post not found" } });

    const res = await POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Post not found");
  });

  it("passes correct post_id to RPC", async () => {
    mockRpc.mockResolvedValue({ error: null });

    await POST(makeRequest(), makeParams("custom-post-id"));

    expect(mockRpc).toHaveBeenCalledWith("increment_post_views", {
      post_id: "custom-post-id",
    });
  });
});
