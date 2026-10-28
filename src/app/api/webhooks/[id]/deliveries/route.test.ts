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
import { GET } from "./route";

const mockAuth = vi.mocked(getAuthContext);
const guard = { lookup: async () => ["93.184.216.34"] };
const as = (id: string) => ({ user: { id, authMethod: "session" }, supabase: {} }) as unknown as AuthContext;
let id: string;

const get = (qs = "") => GET(new NextRequest(`http://localhost/api/webhooks/${id}/deliveries${qs}`), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  const hooks = createHooks(memoryStore(), { guard, fetchImpl });
  state.hooks = hooks;
  mockAuth.mockResolvedValue(as("owner"));
  ({ endpoint: { id } } = await hooks.createEndpoint("owner", { url: "https://hooks.example.com/a", events: ["*"] }));
  for (let i = 0; i < 3; i++) await hooks.emit("owner", "gig.update", { gig_id: `g${i}` });
  await hooks.drain();
});

describe("GET /api/webhooks/[id]/deliveries", () => {
  it("lists deliveries in the old shape with pagination", async () => {
    const res = await get("?limit=2&offset=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ total: 3, limit: 2, offset: 1 });
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ webhook_id: id, event_type: "gig.update", status_code: 500, status: "pending" });
    expect(body.data[0].payload.event).toBe("gig.update");
  });

  it("404 for someone else's webhook, 401 signed out", async () => {
    mockAuth.mockResolvedValue(as("intruder"));
    expect((await get()).status).toBe(404);
    mockAuth.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
});
