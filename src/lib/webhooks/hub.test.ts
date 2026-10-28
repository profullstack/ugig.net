// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";
import { memoryStore, verifySignature, generateSecret } from "@profullstack/webhooks";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { createHooks, legacySignature, WEBHOOK_EVENT_TYPES } from "./hub";
import { supabaseStore } from "./supabase-store";
import { fakeSupabase } from "./__fixtures__/fake-supabase";

/** A public address for every host, so no test touches DNS. */
const guard = { lookup: async () => ["93.184.216.34"] };

type Captured = { url: string; headers: Record<string, string>; body: string };

function receiver(status = 200) {
  const got: Captured[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    got.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
    return new Response("ok", { status });
  });
  return { got, fetchImpl: fetchImpl as unknown as typeof fetch };
}

/**
 * Exactly what a customer wrote against the old ugig sender (src/lib/webhooks/dispatch.ts
 * before this change): createHmac("sha256", secret).update(rawBody).digest("hex")
 * compared to X-Webhook-Signature, then body.event / body.timestamp / body.data.
 */
function oldStyleReceiver(c: Captured, secret: string) {
  const header = c.headers["X-Webhook-Signature"] ?? c.headers["x-webhook-signature"];
  const expected = createHmac("sha256", secret).update(c.body).digest("hex");
  if (header !== expected) return { ok: false as const };
  const body = JSON.parse(c.body);
  return { ok: true as const, event: body.event, timestamp: body.timestamp, data: body.data, eventHeader: c.headers["X-Webhook-Event"] };
}

describe("ugig webhooks hub: old receivers keep verifying", () => {
  it("a migrated endpoint (old 64-hex secret) verifies with the old receiver and with Standard Webhooks", async () => {
    const sb = fakeSupabase();
    const oldSecret = "a".repeat(16) + "0123456789abcdef".repeat(3); // 64 hex chars, like randomBytes(32).toString("hex")
    const now = Date.now();
    // The row the 20261028150000 migration writes from the old webhooks table.
    sb.rows("hub_webhook_endpoints").push({
      id: "3f1c2b9e-0000-4000-8000-000000000001",
      owner: "user-1",
      url: "https://hooks.example.com/ugig",
      secret: oldSecret,
      events: '["application.new", "gig.update"]',
      description: "",
      enabled: 1,
      failures: 0,
      disabled_reason: null,
      created_at: now,
      updated_at: now,
    });
    const { got, fetchImpl } = receiver();
    const hooks = createHooks(supabaseStore(sb), { guard, fetchImpl });

    const r = await hooks.emit("user-1", "application.new", { application_id: "app-9", gig_id: "gig-1" }, { subject: "application:app-9" });
    expect(r.queued).toBe(1);
    expect(await hooks.drain()).toBe(1);

    expect(got).toHaveLength(1);
    const old = oldStyleReceiver(got[0], oldSecret);
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    expect(old.event).toBe("application.new");
    expect(old.eventHeader).toBe("application.new");
    expect(old.data).toEqual({ application_id: "app-9", gig_id: "gig-1" });
    expect(new Date(old.timestamp).toISOString()).toBe(old.timestamp);
    expect(got[0].headers["content-type"]).toBe("application/json");

    // And the Standard Webhooks headers verify with the same secret.
    expect(verifySignature({ headers: got[0].headers, body: got[0].body, secret: oldSecret }).ok).toBe(true);

    // The body is also a CloudEvent.
    const body = JSON.parse(got[0].body);
    expect(body).toMatchObject({ specversion: "1.0", type: "application.new", source: "https://ugig.net", subject: "application:app-9" });
    expect(body.time).toBe(body.timestamp);

    const [delivery] = await hooks.deliveries("user-1");
    expect(delivery).toMatchObject({ status: "delivered", attempts: 1, last_status: 200 });
  });

  it("a new whsec_ endpoint signs X-Webhook-Signature with the secret string as shown", async () => {
    const { got, fetchImpl } = receiver();
    const hooks = createHooks(memoryStore(), { guard, fetchImpl });
    const { endpoint, secret } = await hooks.createEndpoint("user-2", { url: "https://hooks.example.com/x", events: ["review.new"] });
    expect(secret.startsWith("whsec_")).toBe(true);
    await hooks.emit("user-2", "review.new", { review_id: "r1" });
    await hooks.drain();
    expect(got).toHaveLength(1);
    expect(oldStyleReceiver(got[0], secret).ok).toBe(true);
    expect(verifySignature({ headers: got[0].headers, body: got[0].body, secret }).ok).toBe(true);
    expect(endpoint.events).toEqual(["review.new"]);
  });

  it("legacySignature is the old createHmac(secret) hex", () => {
    const s = generateSecret();
    expect(legacySignature("{}", s)).toBe(createHmac("sha256", s).update("{}").digest("hex"));
  });

  it("refuses event patterns ugig does not emit, and only sends subscribed events", async () => {
    const { got, fetchImpl } = receiver();
    const hooks = createHooks(memoryStore(), { guard, fetchImpl });
    await expect(hooks.createEndpoint("u", { url: "https://hooks.example.com/", events: ["room.joined"] })).rejects.toThrow(/no event matches/);
    await hooks.createEndpoint("u", { url: "https://hooks.example.com/", events: ["gig.update"] });
    expect((await hooks.emit("u", "message.new", {})).queued).toBe(0);
    expect((await hooks.emit("u", "gig.update", { gig_id: "g" })).queued).toBe(1);
    await hooks.drain();
    expect(got.map((g) => JSON.parse(g.body).event)).toEqual(["gig.update"]);
    expect(WEBHOOK_EVENT_TYPES).toEqual(["application.new", "message.new", "gig.update", "review.new"]);
  });

  it("a failed delivery stays pending for a retry instead of being dropped", async () => {
    const { got, fetchImpl } = receiver(503);
    const sb = fakeSupabase();
    const hooks = createHooks(supabaseStore(sb), { guard, fetchImpl });
    await hooks.createEndpoint("u", { url: "https://hooks.example.com/", events: ["*"] });
    await hooks.emit("u", "message.new", { message_id: "m" });
    await hooks.drain();
    expect(got).toHaveLength(1);
    const [d] = await hooks.deliveries("u");
    expect(d).toMatchObject({ status: "pending", attempts: 1, last_status: 503 });
    expect(new Date(d.next_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses private and plain-http URLs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const hooks = createHooks(memoryStore(), { guard: { lookup: async () => ["10.0.0.5"] } });
      await expect(hooks.createEndpoint("u", { url: "https://internal.example.com/" })).rejects.toThrow(/url/);
      await expect(createHooks(memoryStore(), { guard: { ...guard } }).createEndpoint("u", { url: "http://hooks.example.com/" })).rejects.toThrow(/url/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
