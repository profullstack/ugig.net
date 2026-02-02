import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { dispatchWebhook } from "./dispatch";

// ── Helpers ────────────────────────────────────────────────────────

const userId = "user-dispatch-123";
const webhookSecret = "test-secret-hex-string";

function makeWebhook(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh-1",
    url: "https://example.com/webhook",
    secret: webhookSecret,
    events: ["application.new", "gig.update"],
    ...overrides,
  };
}

/**
 * Set up the mock chain for the webhooks select query.
 * Returns the chainable mock so tests can customize further.
 */
function setupWebhookQuery(result: {
  data: unknown;
  error: unknown;
}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq", "insert"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // The final .eq("active", true) resolves with the result
  chain.eq.mockReturnValue(chain);
  // Make the last eq call resolve
  // We need the chain to resolve when accessed as a promise-like — 
  // the supabase client returns the result after the last .eq()
  // Since we have chained .eq calls, mock the return to eventually resolve
  let eqCallCount = 0;
  chain.eq.mockImplementation(() => {
    eqCallCount++;
    if (eqCallCount >= 2) {
      // After user_id + active eq calls, resolve
      return Promise.resolve(result);
    }
    return chain;
  });

  return chain;
}

function setupInsertChain() {
  const insertChain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["insert"]) {
    insertChain[m] = vi.fn().mockResolvedValue({ error: null });
  }
  return insertChain;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Stub env vars for admin client creation
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ════════════════════════════════════════════════════════════════════
//  dispatchWebhook
// ════════════════════════════════════════════════════════════════════

describe("dispatchWebhook", () => {
  it("sends POST to matching webhook URLs with correct payload", async () => {
    const webhook = makeWebhook();

    // First from("webhooks") → select query
    const selectChain = setupWebhookQuery({
      data: [webhook],
      error: null,
    });

    // Second from("webhook_deliveries") → insert
    const deliveryChain = setupInsertChain();

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++;
      if (table === "webhooks") return selectChain;
      if (table === "webhook_deliveries") return deliveryChain;
      return selectChain;
    });

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    const payload = { gig_id: "gig-1", applicant_id: "user-2" };
    await dispatchWebhook(userId, "application.new", payload);

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe("https://example.com/webhook");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Webhook-Event"]).toBe("application.new");

    // Verify the body structure
    const body = JSON.parse(options.body);
    expect(body.event).toBe("application.new");
    expect(body.data).toEqual(payload);
    expect(body.timestamp).toBeDefined();
  });

  it("includes HMAC-SHA256 signature header", async () => {
    const webhook = makeWebhook();

    const selectChain = setupWebhookQuery({
      data: [webhook],
      error: null,
    });
    const deliveryChain = setupInsertChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "webhooks") return selectChain;
      return deliveryChain;
    });

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    await dispatchWebhook(userId, "application.new", { test: true });

    const [, options] = mockFetch.mock.calls[0];
    const signature = options.headers["X-Webhook-Signature"];
    expect(signature).toBeDefined();

    // Verify signature is valid HMAC-SHA256
    const expectedSignature = createHmac("sha256", webhookSecret)
      .update(options.body)
      .digest("hex");
    expect(signature).toBe(expectedSignature);
  });

  it("logs deliveries with status code", async () => {
    const webhook = makeWebhook();

    const selectChain = setupWebhookQuery({
      data: [webhook],
      error: null,
    });
    const deliveryChain = setupInsertChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "webhooks") return selectChain;
      return deliveryChain;
    });

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    await dispatchWebhook(userId, "application.new", { test: true });

    // Verify delivery was logged
    expect(deliveryChain.insert).toHaveBeenCalledTimes(1);
    const insertArgs = deliveryChain.insert.mock.calls[0][0];
    expect(insertArgs.webhook_id).toBe("wh-1");
    expect(insertArgs.event_type).toBe("application.new");
    expect(insertArgs.status_code).toBe(200);
    expect(insertArgs.response_body).toBe("OK");
    expect(insertArgs.payload).toBeDefined();
  });

  it("handles timeout gracefully", async () => {
    const webhook = makeWebhook();

    const selectChain = setupWebhookQuery({
      data: [webhook],
      error: null,
    });
    const deliveryChain = setupInsertChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "webhooks") return selectChain;
      return deliveryChain;
    });

    // Simulate an abort error (timeout) — use a regular Error because
    // DOMException in jsdom doesn't pass `instanceof Error`, which makes
    // the source code fall through to "Unknown delivery error".
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValue(abortError);

    await dispatchWebhook(userId, "application.new", { test: true });

    // Should not throw — fire and forget
    // Delivery should still be logged with error
    expect(deliveryChain.insert).toHaveBeenCalledTimes(1);
    const insertArgs = deliveryChain.insert.mock.calls[0][0];
    expect(insertArgs.status_code).toBe(0);
    expect(insertArgs.response_body).toContain("aborted");
  });

  it("skips webhooks that don't match the event type", async () => {
    // Webhook only subscribes to "gig.update", not "review.new"
    const webhook = makeWebhook({ events: ["gig.update"] });

    const selectChain = setupWebhookQuery({
      data: [webhook],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "webhooks") return selectChain;
      return setupInsertChain();
    });

    await dispatchWebhook(userId, "review.new", { test: true });

    // fetch should NOT be called — no matching webhooks
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not crash on fetch failure", async () => {
    const webhook = makeWebhook();

    const selectChain = setupWebhookQuery({
      data: [webhook],
      error: null,
    });
    const deliveryChain = setupInsertChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "webhooks") return selectChain;
      return deliveryChain;
    });

    // Network error
    mockFetch.mockRejectedValue(new Error("Network error"));

    // Should not throw
    await expect(
      dispatchWebhook(userId, "application.new", { test: true })
    ).resolves.toBeUndefined();

    // Delivery should still be logged
    expect(deliveryChain.insert).toHaveBeenCalledTimes(1);
    const insertArgs = deliveryChain.insert.mock.calls[0][0];
    expect(insertArgs.status_code).toBe(0);
    expect(insertArgs.response_body).toBe("Network error");
  });

  it("returns early when no webhooks found", async () => {
    const selectChain = setupWebhookQuery({
      data: [],
      error: null,
    });

    mockFrom.mockReturnValue(selectChain);

    await dispatchWebhook(userId, "application.new", { test: true });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns early when query errors", async () => {
    const selectChain = setupWebhookQuery({
      data: null,
      error: { message: "DB error" },
    });

    mockFrom.mockReturnValue(selectChain);

    await dispatchWebhook(userId, "application.new", { test: true });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("dispatches to multiple matching webhooks concurrently", async () => {
    const webhook1 = makeWebhook({ id: "wh-1", url: "https://example.com/hook1" });
    const webhook2 = makeWebhook({ id: "wh-2", url: "https://example.com/hook2" });

    const selectChain = setupWebhookQuery({
      data: [webhook1, webhook2],
      error: null,
    });
    const deliveryChain = setupInsertChain();

    mockFrom.mockImplementation((table: string) => {
      if (table === "webhooks") return selectChain;
      return deliveryChain;
    });

    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("OK"),
    });

    await dispatchWebhook(userId, "application.new", { test: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/hook1");
    expect(mockFetch.mock.calls[1][0]).toBe("https://example.com/hook2");
    expect(deliveryChain.insert).toHaveBeenCalledTimes(2);
  });
});
