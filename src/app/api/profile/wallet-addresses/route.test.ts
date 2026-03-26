import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import * as serviceModule from "@/lib/supabase/service";

const USER_ID = "u1u1u1u1-a2a2-b3b3-c4c4-d5d5d5d5d5d5";
const WORKER_ID = "w1w1w1w1-e2e2-f3f3-a4a4-b5b5b5b5b5b5";

function req(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/profile/wallet-addresses");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return { url: url.toString(), headers: new Headers() } as any;
}

describe("GET /api/profile/wallet-addresses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 if not authenticated", async () => {
    (getAuthContext as any).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns poster addresses from profile", async () => {
    const walletAddresses = [
      { currency: "sol", address: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV", is_preferred: true },
      { currency: "eth", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28", is_preferred: false },
    ];
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { wallet_addresses: walletAddresses }, error: null }),
      }),
    };
    (getAuthContext as any).mockResolvedValue({ user: { id: USER_ID }, supabase: sb });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poster_addresses).toHaveLength(2);
    expect(body.poster_addresses[0].currency).toBe("sol");
    expect(body.poster_addresses[0].is_preferred).toBe(true);
    expect(body.worker_addresses).toHaveLength(0);
  });

  it("returns both poster and worker addresses when worker_id + gig_id provided", async () => {
    const posterAddrs = [
      { currency: "sol", address: "PosterAddr12345678901234567890", is_preferred: true },
    ];
    const workerAddrs = [
      { currency: "sol", address: "WorkerAddr12345678901234567890", is_preferred: false },
      { currency: "btc", address: "bc1qworkerbtcaddress1234567890", is_preferred: true },
    ];

    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { wallet_addresses: posterAddrs }, error: null }),
      }),
    };

    const service = {
      from: vi.fn((table: string) => {
        if (table === "gigs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: "g1", poster_id: USER_ID }, error: null }),
          };
        }
        if (table === "applications") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "a1" }, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { wallet_addresses: workerAddrs }, error: null }),
        };
      }),
    };

    vi.spyOn(serviceModule, "createServiceClient").mockReturnValue(service as any);
    (getAuthContext as any).mockResolvedValue({ user: { id: USER_ID }, supabase: sb });

    const res = await GET(req({ worker_id: WORKER_ID, gig_id: "g1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poster_addresses).toHaveLength(1);
    expect(body.worker_addresses).toHaveLength(2);
  });

  it("returns empty arrays when no wallet addresses saved", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { wallet_addresses: null }, error: null }),
      }),
    };
    (getAuthContext as any).mockResolvedValue({ user: { id: USER_ID }, supabase: sb });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poster_addresses).toEqual([]);
    expect(body.worker_addresses).toEqual([]);
  });

  it("returns empty arrays when profile not found", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      }),
    };
    (getAuthContext as any).mockResolvedValue({ user: { id: USER_ID }, supabase: sb });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poster_addresses).toEqual([]);
  });

  it("handles non-array wallet_addresses gracefully", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { wallet_addresses: "not-an-array" }, error: null }),
      }),
    };
    (getAuthContext as any).mockResolvedValue({ user: { id: USER_ID }, supabase: sb });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poster_addresses).toEqual([]);
  });
});
