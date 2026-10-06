import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase & { auth?: unknown };
const mockSessionCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
    checkout: { sessions: { create: (...a: unknown[]) => mockSessionCreate(...a) } },
  },
  PLANS: { pro: { priceId: "price_pro" } },
}));

import { POST } from "./route";

function seed(sub: Record<string, unknown> | null) {
  db = createFakeSupabase({
    subscriptions: sub ? [{ user_id: "user-1", stripe_customer_id: "cus_1", ...sub }] : [],
    profiles: [{ id: "user-1", username: "u" }],
  });
  db.auth = { getUser: async () => ({ data: { user: { id: "user-1", email: "u@example.test" } }, error: null }) };
}

const checkout = () => POST(new NextRequest("http://localhost/api/subscriptions/checkout", { method: "POST" }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.example/cs_1" });
});

describe("POST /api/subscriptions/checkout (Stripe Pro)", () => {
  it("refuses a Lifetime member (a Stripe sub would overwrite Lifetime with Pro)", async () => {
    seed({ plan: "lifetime", status: "active" });
    const res = await checkout();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Lifetime/);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("refuses an active Pro member", async () => {
    seed({ plan: "pro", status: "active" });
    expect((await checkout()).status).toBe(400);
  });

  it("lets a free user check out", async () => {
    seed({ plan: "free", status: "active" });
    const res = await checkout();
    expect(res.status).toBe(200);
    expect(mockSessionCreate).toHaveBeenCalled();
  });
});
