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
import { PUT, DELETE } from "./route";

const mockAuth = vi.mocked(getAuthContext);
const guard = { lookup: async () => ["93.184.216.34"] };
const as = (id: string) => ({ user: { id, authMethod: "session" }, supabase: {} }) as unknown as AuthContext;
let hooks: ReturnType<typeof createHooks>;
let id: string;

function req(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/webhooks/${id}`, {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
}
const params = () => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  hooks = createHooks(memoryStore(), { guard });
  state.hooks = hooks;
  mockAuth.mockResolvedValue(as("owner"));
  ({ endpoint: { id } } = await hooks.createEndpoint("owner", { url: "https://hooks.example.com/a", events: ["gig.update"] }));
});

describe("PUT /api/webhooks/[id]", () => {
  it("401 without auth", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await PUT(req("PUT", { active: false }), params())).status).toBe(401);
  });

  it("updates url, events and active", async () => {
    const res = await PUT(req("PUT", { url: "https://hooks.example.com/b", events: ["review.new"], active: false }), params());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toMatchObject({ id, url: "https://hooks.example.com/b", events: ["review.new"], active: false });
  });

  it("404 for someone else's webhook", async () => {
    mockAuth.mockResolvedValue(as("intruder"));
    const res = await PUT(req("PUT", { active: false }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Webhook not found");
    expect((await hooks.getEndpoint("owner", id)).enabled).toBe(true);
  });

  it("400 for a bad event", async () => {
    expect((await PUT(req("PUT", { events: ["nope"] }), params())).status).toBe(400);
  });
});

describe("DELETE /api/webhooks/[id]", () => {
  it("deletes the caller's webhook", async () => {
    const res = await DELETE(req("DELETE"), params());
    expect(await res.json()).toEqual({ success: true });
    expect(await hooks.listEndpoints("owner")).toEqual([]);
  });

  it("will not delete someone else's", async () => {
    mockAuth.mockResolvedValue(as("intruder"));
    expect((await DELETE(req("DELETE"), params())).status).toBe(404);
    expect(await hooks.listEndpoints("owner")).toHaveLength(1);
  });
});
