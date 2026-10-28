// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { memoryStore } from "@profullstack/webhooks";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/auth/get-user", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/get-user")>();
  return { ...actual, getAuthContext: vi.fn() };
});

const state = vi.hoisted(() => ({ hooks: null as unknown }));
vi.mock("@/lib/webhooks/hub", async (orig) => {
  const actual = await orig<typeof import("@/lib/webhooks/hub")>();
  return { ...actual, getHooks: () => state.hooks };
});

import { getAuthContext, type AuthContext } from "@/lib/auth/get-user";
import { createHooks } from "@/lib/webhooks/hub";
import { GET, POST, PATCH, DELETE } from "./route";

const mockAuth = vi.mocked(getAuthContext);
const guard = { lookup: async () => ["93.184.216.34"] };
const as = (id: string, scope?: string) => ({ user: { id, authMethod: "api_key", scope }, supabase: {} }) as unknown as AuthContext;

const req = (method: string, path = "", body?: unknown) =>
  new NextRequest(`http://localhost/api/v1/webhooks${path}`, {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

let sent: Array<{ url: string }>;

beforeEach(() => {
  sent = [];
  const fetchImpl = (async (url: string) => (sent.push({ url: String(url) }), new Response(null, { status: 204 }))) as unknown as typeof fetch;
  state.hooks = createHooks(memoryStore(), { guard, fetchImpl });
  mockAuth.mockResolvedValue(as("user-1", "full"));
});

describe("/api/v1/webhooks", () => {
  it("401 without a key or session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });

  it("403 for a public-scope key", async () => {
    mockAuth.mockResolvedValue(as("user-1", "public"));
    expect((await GET(req("GET"))).status).toBe(403);
  });

  it("create, list, test, rotate, secret, patch, deliveries, delete", async () => {
    const created = await POST(req("POST", "", { url: "https://hooks.example.com/x", events: ["gig.*"], description: "ci" }));
    expect(created.status).toBe(201);
    const { endpoint, secret } = await created.json();
    expect(secret).toMatch(/^whsec_/);

    const list = await (await GET(req("GET"))).json();
    expect(list.endpoints.map((e: { id: string }) => e.id)).toEqual([endpoint.id]);
    expect(list.event_types).toEqual(["application.new", "message.new", "gig.update", "review.new"]);

    const test = await (await POST(req("POST", `/${endpoint.id}/test`))).json();
    expect(test).toMatchObject({ ok: true, status: 204 });
    expect(sent).toEqual([{ url: "https://hooks.example.com/x" }]);

    const rotated = await (await POST(req("POST", `/${endpoint.id}/rotate`))).json();
    expect(rotated.secret).not.toBe(secret);
    expect((await (await GET(req("GET", `/${endpoint.id}/secret`))).json()).secret).toBe(rotated.secret);

    const patched = await (await PATCH(req("PATCH", `/${endpoint.id}`, { enabled: false }))).json();
    expect(patched.enabled).toBe(false);

    const dl = await (await GET(req("GET", `/${endpoint.id}/deliveries`))).json();
    expect(dl.deliveries[0]).toMatchObject({ event_type: "webhook.test", status: "delivered" });

    expect((await DELETE(req("DELETE", `/${endpoint.id}`))).status).toBe(200);
    expect((await (await GET(req("GET"))).json()).endpoints).toEqual([]);
  });

  it("scopes every endpoint to its owner", async () => {
    const { endpoint } = await (await POST(req("POST", "", { url: "https://hooks.example.com/x" }))).json();
    mockAuth.mockResolvedValue(as("user-2", "full"));
    expect((await GET(req("GET", `/${endpoint.id}/secret`))).status).toBe(404);
    expect((await DELETE(req("DELETE", `/${endpoint.id}`))).status).toBe(404);
  });

  it("refuses an event ugig does not emit", async () => {
    const res = await POST(req("POST", "", { url: "https://hooks.example.com/x", events: ["room.joined"] }));
    expect(res.status).toBe(400);
  });
});
