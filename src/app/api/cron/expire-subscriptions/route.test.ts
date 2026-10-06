import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));

import { POST } from "./route";

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function call(query = "", secret = "cron-secret") {
  return POST(
    new NextRequest(`http://localhost/api/cron/expire-subscriptions${query}`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  db = createFakeSupabase({
    subscriptions: [
      { id: "s1", user_id: "u-lapsed", plan: "pro", status: "active", stripe_subscription_id: null, current_period_end: ago(4 * DAY) },
      { id: "s2", user_id: "u-grace", plan: "pro", status: "active", stripe_subscription_id: null, current_period_end: ago(2 * DAY) },
      { id: "s3", user_id: "u-stripe", plan: "pro", status: "active", stripe_subscription_id: "sub_123", current_period_end: ago(30 * DAY) },
      { id: "s4", user_id: "u-life", plan: "lifetime", status: "active", stripe_subscription_id: null, current_period_end: ago(400 * DAY) },
      { id: "s5", user_id: "u-free", plan: "free", status: "active", stripe_subscription_id: null, current_period_end: null },
    ],
    notifications: [],
  });
});

const planOf = (user: string) => db.tables.subscriptions.find((s) => s.user_id === user)?.plan;

describe("POST /api/cron/expire-subscriptions", () => {
  it("requires CRON_SECRET", async () => {
    expect((await call("", "nope")).status).toBe(401);
  });

  it("downgrades only CoinPay Pro more than 3 days past its end", async () => {
    const res = await call();
    expect(await res.json()).toMatchObject({ lapsed: 1, downgraded: 1 });
    expect(db.tables.subscriptions.find((s) => s.id === "s1")).toMatchObject({ plan: "free", status: "canceled" });
    expect(planOf("u-grace")).toBe("pro");
    expect(planOf("u-stripe")).toBe("pro");
    expect(planOf("u-life")).toBe("lifetime");
    expect(db.tables.notifications).toHaveLength(1);
    expect(db.tables.notifications[0].user_id).toBe("u-lapsed");
  });

  it("is idempotent", async () => {
    await call();
    const second = await (await call()).json();
    expect(second).toMatchObject({ lapsed: 0, downgraded: 0 });
    expect(db.tables.notifications).toHaveLength(1);
  });

  it("dry run changes nothing", async () => {
    const body = await (await call("?dry_run=1")).json();
    expect(body.would_downgrade).toEqual(["u-lapsed"]);
    expect(planOf("u-lapsed")).toBe("pro");
  });
});
