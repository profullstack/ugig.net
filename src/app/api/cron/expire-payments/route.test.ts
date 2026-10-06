import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));

import { POST } from "./route";

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

function call(query = "", secret = "cron-secret") {
  return POST(
    new NextRequest(`http://localhost/api/cron/expire-payments${query}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    })
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  db = createFakeSupabase({
    payments: [
      { id: "past-expiry", status: "pending", created_at: ago(2 * HOUR), metadata: { expires_at: ago(HOUR) } },
      { id: "before-expiry", status: "pending", created_at: ago(2 * HOUR), metadata: { expires_at: ahead(HOUR) } },
      { id: "no-expiry-old", status: "pending", created_at: ago(25 * HOUR), metadata: {} },
      { id: "no-expiry-new", status: "pending", created_at: ago(23 * HOUR), metadata: null },
      { id: "confirmed-old", status: "confirmed", created_at: ago(100 * HOUR), metadata: { expires_at: ago(99 * HOUR) } },
    ],
  });
});

const statusOf = (id: string) => db.tables.payments.find((p) => p.id === id)?.status;

describe("POST /api/cron/expire-payments", () => {
  it("requires CRON_SECRET", async () => {
    expect((await call("", "wrong")).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call("", "")).status).toBe(401);
  });

  it("expires pending rows past expires_at, or 24h old without one", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checked: 4, expired: 2 });
    expect(statusOf("past-expiry")).toBe("expired");
    expect(statusOf("no-expiry-old")).toBe("expired");
    expect(statusOf("before-expiry")).toBe("pending");
    expect(statusOf("no-expiry-new")).toBe("pending");
    expect(statusOf("confirmed-old")).toBe("confirmed");
  });

  it("dry run changes nothing", async () => {
    const body = await (await call("?dry_run=1")).json();
    expect(body.would_expire.sort()).toEqual(["no-expiry-old", "past-expiry"]);
    expect(statusOf("past-expiry")).toBe("pending");
  });
});
