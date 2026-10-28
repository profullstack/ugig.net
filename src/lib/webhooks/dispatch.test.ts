// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryStore } from "@profullstack/webhooks";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const state = vi.hoisted(() => ({ hooks: null as unknown }));
vi.mock("./hub", async (orig) => {
  const actual = await orig<typeof import("./hub")>();
  return { ...actual, getHooks: () => state.hooks };
});

import { createHooks } from "./hub";
import { dispatchWebhook, dispatchWebhookAsync, subjectFor } from "./dispatch";

const guard = { lookup: async () => ["93.184.216.34"] };

describe("dispatchWebhook", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let hooks: ReturnType<typeof createHooks>;

  beforeEach(() => {
    fetchImpl = vi.fn(async () => new Response("ok"));
    hooks = createHooks(memoryStore(), { guard, fetchImpl: fetchImpl as unknown as typeof fetch });
    state.hooks = hooks;
  });

  it("queues to the outbox for subscribed endpoints only, then the drainer sends", async () => {
    await hooks.createEndpoint("user-1", { url: "https://a.example.com/", events: ["application.new"] });
    await hooks.createEndpoint("user-1", { url: "https://b.example.com/", events: ["gig.update"] });
    await hooks.createEndpoint("user-2", { url: "https://c.example.com/", events: ["*"] });

    await dispatchWebhook("user-1", "application.new", { application_id: "a1", gig_id: "g1" });
    expect(fetchImpl).not.toHaveBeenCalled(); // queued, not sent inline
    const queued = await hooks.deliveries("user-1");
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ event_type: "application.new", status: "pending" });
    expect(queued[0].payload).toMatchObject({ subject: "application:a1", data: { application_id: "a1", gig_id: "g1" } });

    await hooks.drain();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://a.example.com/");
  });

  it("does nothing for a user with no endpoints", async () => {
    await dispatchWebhook("nobody", "message.new", { message_id: "m" });
    expect(await hooks.deliveries("nobody")).toEqual([]);
  });

  it("never throws when the hub fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    state.hooks = { emit: vi.fn().mockRejectedValue(new Error("db down")) };
    await expect(dispatchWebhook("u", "gig.update", { gig_id: "g" })).resolves.toBeUndefined();
    dispatchWebhookAsync("u", "gig.update", { gig_id: "g" });
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("names a subject from the payload", () => {
    expect(subjectFor({ review_id: "r", gig_id: "g" })).toBe("review:r");
    expect(subjectFor({ gig_id: "g" })).toBe("gig:g");
    expect(subjectFor({ conversation_id: "c" })).toBe("conversation:c");
    expect(subjectFor({})).toBeUndefined();
  });
});
