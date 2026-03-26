import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const verifyApiKeyMock = vi.fn();
const getKeyPrefixMock = vi.fn((k: string) => k.slice(0, 16));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
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
});
