import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const verifyApiKeyMock = vi.fn();
const getKeyPrefixMock = vi.fn((k: string) => k.slice(0, 16));

// Totals across the whole file. Deliberately not vi.fn() call counts:
// clearAllMocks() resets those between tests, and both figures here describe
// the process lifetime rather than a single test.
const clients = { created: 0, disconnected: 0 };

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    clients.created += 1;
    return {
      rpc: rpcMock,
      realtime: {
        disconnect: () => {
          clients.disconnected += 1;
        },
      },
    };
  }),
}));

vi.mock("@/lib/api-keys", () => ({
  verifyApiKey: (key: string, hash: string) => verifyApiKeyMock(key, hash),
  getKeyPrefix: (key: string) => getKeyPrefixMock(key),
}));

import { authenticateApiKey } from "./api-key";

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    rpcMock.mockImplementation((fnName: string) => {
      if (fnName === "get_api_key_user") {
        return Promise.resolve({
          data: [{ user_id: "user-1", key_id: "key-1", key_hash: "hash-1", scope: "full" }],
          error: null,
        });
      }

      if (fnName === "update_api_key_last_used") {
        return Promise.resolve({ data: null, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    });

    verifyApiKeyMock.mockResolvedValue(true);
  });

  it("authenticates with X-API-Key header", async () => {
    const result = await authenticateApiKey(null, "ugig_live_abc123");
    expect(result).toEqual({ userId: "user-1", keyId: "key-1", scope: "full" });
  });

  it("authenticates with Bearer API key in Authorization header", async () => {
    const result = await authenticateApiKey("Bearer ugig_live_abc123", null);
    expect(result).toEqual({ userId: "user-1", keyId: "key-1", scope: "full" });
  });

  it("authenticates with ApiKey auth scheme", async () => {
    const result = await authenticateApiKey("ApiKey ugig_live_abc123", null);
    expect(result).toEqual({ userId: "user-1", keyId: "key-1", scope: "full" });
  });

  it("rejects non-API-key Bearer tokens", async () => {
    const result = await authenticateApiKey("Bearer eyJhbGciOi...", null);
    expect(result).toBeNull();
  });

  // authenticateApiKey runs on every API-key-authenticated request. It used to
  // build a Supabase client per call, and each one kept a RealtimeClient (plus,
  // under default auth options, a token-refresh interval) alive after the
  // response was sent -- a per-request resource outliving its request, which is
  // what drove the production heap to its 1GB cap and OOMed the container.
  // Going back to a per-call createClient() would make this count climb with
  // the number of authentications instead of staying at one.
  it("does not build a Supabase client per authentication", async () => {
    const before = clients.created;

    await authenticateApiKey(null, "ugig_live_abc123");
    await authenticateApiKey(null, "ugig_live_abc123");
    await authenticateApiKey(null, "ugig_live_abc123");

    expect(clients.created - before).toBe(0);
    expect(clients.created).toBeLessThanOrEqual(1);
  });

  // A client that keeps its RealtimeClient connected holds WebSocket state for
  // the life of the process, which is the other half of the same leak.
  it("disconnects realtime on every client it builds", () => {
    expect(clients.created).toBeGreaterThan(0);
    expect(clients.disconnected).toBe(clients.created);
  });
});
