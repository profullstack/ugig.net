import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateApiKey = vi.fn();
const authenticateWithToken = vi.fn();
const authenticateAgentPass = vi.fn();
vi.mock("@/lib/auth/api-key", () => ({ authenticateApiKey: (...a: unknown[]) => authenticateApiKey(...a) }));
vi.mock("@/lib/supabase/service", () => ({ authenticateWithToken: (...a: unknown[]) => authenticateWithToken(...a) }));
vi.mock("@/lib/auth/agentpass", () => ({ authenticateAgentPass: (...a: unknown[]) => authenticateAgentPass(...a) }));

import { authenticateCrawl, clearCrawlAuthCache, credentialKind } from "./crawl-auth";

const req = (headers: Record<string, string>) => new Request("https://ugig.net/api/gigs/1", { headers });
const KEY = `ugig_live_${crypto.randomUUID().replace(/-/g, "")}`;

beforeEach(() => {
  vi.clearAllMocks();
  clearCrawlAuthCache();
});

describe("credentialKind", () => {
  it("reads ugig keys from every scheme the routes accept", () => {
    expect(credentialKind(req({ authorization: `Bearer ${KEY}` }))?.kind).toBe("api_key");
    expect(credentialKind(req({ authorization: `ApiKey ${KEY}` }))?.kind).toBe("api_key");
    expect(credentialKind(req({ "x-api-key": KEY }))?.kind).toBe("api_key");
    expect(credentialKind(req({ authorization: "Bearer aaa.bbb.ccc" }))?.kind).toBe("jwt");
    expect(credentialKind(req({ authorization: "AgentPass p:s:1" }))?.kind).toBe("agentpass");
    expect(credentialKind(req({ authorization: "Bearer junk" }))?.kind).toBe("unknown_bearer");
  });

  it("leaves the gateway's own credentials and other schemes alone", () => {
    expect(credentialKind(req({}))).toBeNull();
    expect(credentialKind(req({ authorization: "Bearer cp_abc.def" }))).toBeNull();
    expect(credentialKind(req({ authorization: "Basic dXNlcjpwYXNz" }))).toBeNull();
  });
});

describe("authenticateCrawl", () => {
  it("passes a verified API key and remembers it", async () => {
    authenticateApiKey.mockResolvedValue({ userId: "u", keyId: "k", scope: "full" });
    expect(await authenticateCrawl(req({ authorization: `Bearer ${KEY}` }))).toBe(true);
    expect(await authenticateCrawl(req({ authorization: `Bearer ${KEY}` }))).toBe(true);
    expect(authenticateApiKey).toHaveBeenCalledTimes(1);
  });

  it("refuses a ugig key the database does not know, and does not remember the refusal", async () => {
    authenticateApiKey.mockResolvedValue(null);
    expect(await authenticateCrawl(req({ authorization: `Bearer ${KEY}` }))).toBe(false);
    expect(await authenticateCrawl(req({ authorization: `Bearer ${KEY}` }))).toBe(false);
    expect(authenticateApiKey).toHaveBeenCalledTimes(2);
  });

  it("refuses a bogus bearer without a lookup, so it gets 401 rather than a crawl offer", async () => {
    expect(await authenticateCrawl(req({ authorization: "Bearer junk" }))).toBe(false);
    expect(authenticateApiKey).not.toHaveBeenCalled();
  });

  it("verifies a Supabase access token with GoTrue", async () => {
    authenticateWithToken.mockResolvedValueOnce({ user: { id: "u" } }).mockResolvedValueOnce(null);
    expect(await authenticateCrawl(req({ authorization: "Bearer aaa.bbb.ccc" }))).toBe(true);
    expect(await authenticateCrawl(req({ authorization: "Bearer ddd.eee.fff" }))).toBe(false);
  });

  it("has no opinion without a credential", async () => {
    expect(await authenticateCrawl(req({}))).toBeNull();
  });
});
