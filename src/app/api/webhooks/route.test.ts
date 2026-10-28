// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { memoryStore } from "@profullstack/webhooks";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: vi.fn() }));

const state = vi.hoisted(() => ({ hooks: null as unknown }));
vi.mock("@/lib/webhooks/hub", async (orig) => {
  const actual = await orig<typeof import("@/lib/webhooks/hub")>();
  return { ...actual, getHooks: () => state.hooks };
});

import { getAuthContext, type AuthContext } from "@/lib/auth/get-user";
import { createHooks } from "@/lib/webhooks/hub";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(getAuthContext);
const guard = { lookup: async (host: string) => (host === "internal.example.com" ? ["10.0.0.1"] : ["93.184.216.34"]) };
const auth = { user: { id: "user-123", authMethod: "session" }, supabase: {} } as unknown as AuthContext;

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/webhooks", {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  state.hooks = createHooks(memoryStore(), { guard });
  mockAuth.mockResolvedValue(auth);
});

describe("GET /api/webhooks", () => {
  it("401 without auth", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("lists the caller's webhooks in the old shape, without secrets", async () => {
    await POST(req("POST", { url: "https://hooks.example.com/a", events: ["gig.update"] }));
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ url: "https://hooks.example.com/a", events: ["gig.update"], active: true });
    expect(data[0].secret).toBeUndefined();
  });
});

describe("POST /api/webhooks", () => {
  it("creates a webhook and returns its secret once", async () => {
    const res = await POST(req("POST", { url: "https://hooks.example.com/a", events: ["application.new", "message.new"] }));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ url: "https://hooks.example.com/a", events: ["application.new", "message.new"], active: true });
    expect(data.secret).toMatch(/^whsec_/);
  });

  it("creates an inactive webhook", async () => {
    const { data } = await (await POST(req("POST", { url: "https://hooks.example.com/a", events: ["review.new"], active: false }))).json();
    expect(data.active).toBe(false);
  });

  it("validates events and urls", async () => {
    expect((await POST(req("POST", { url: "https://hooks.example.com/a", events: [] }))).status).toBe(400);
    expect((await POST(req("POST", { url: "https://hooks.example.com/a", events: ["nope"] }))).status).toBe(400);
    expect((await POST(req("POST", { url: "not a url", events: ["gig.update"] }))).status).toBe(400);
    const priv = await POST(req("POST", { url: "https://internal.example.com/", events: ["gig.update"] }));
    expect(priv.status).toBe(400);
  });

  it("caps webhooks at 10 per user", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(req("POST", { url: `https://hooks.example.com/${i}`, events: ["gig.update"] }))).status).toBe(201);
    }
    const res = await POST(req("POST", { url: "https://hooks.example.com/11", events: ["gig.update"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Maximum of 10/);
  });
});
