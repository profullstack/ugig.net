import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: any[]) => mockGetAuthContext(...args),
}));

// Mock supabase
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockSingle = vi.fn();
const mockRpc = vi.fn();

const mockFrom = vi.fn<any>(() => ({
  select: mockSelect,
  update: mockUpdate,
  insert: mockInsert,
  eq: mockEq,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Mock wallet-utils
const mockGetUserLnWallet = vi.fn();
const mockGetLnBalance = vi.fn();
const mockPayInvoice = vi.fn();
const mockSyncBalanceCache = vi.fn();

vi.mock("@/lib/lightning/wallet-utils", () => ({
  getUserLnWallet: (...args: any[]) => mockGetUserLnWallet(...args),
  getLnBalance: (...args: any[]) => mockGetLnBalance(...args),
  payInvoice: (...args: any[]) => mockPayInvoice(...args),
  syncBalanceCache: (...args: any[]) => mockSyncBalanceCache(...args),
}));

// Mock fetch for LNURL resolution
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { POST } from "./route";

function makeRequest(body: any) {
  return new Request("http://localhost/api/wallet/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

function makeRawRequest(body: string) {
  return new Request("http://localhost/api/wallet/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }) as any;
}

describe("POST /api/wallet/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-123" } });

    // Default chain: rate limit check returns 0
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        }),
      }),
    });

    // Default: user has an LNbits wallet
    mockGetUserLnWallet.mockResolvedValue({
      admin_key: "admin-key-123",
      invoice_key: "invoice-key-123",
    });

    // Default: user has 1000 sats
    mockGetLnBalance.mockResolvedValue(1000);

    // Default: sync succeeds
    mockSyncBalanceCache.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(makeRequest({ amount_sats: 100, destination: "user@wallet.com" }));
    expect(res.status).toBe(401);
  });

  it("rejects malformed JSON without starting withdrawal lookup", async () => {
    const res = await POST(makeRawRequest("{not valid json"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON bodies without starting withdrawal lookup", async () => {
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    const res = await POST(makeRequest({ amount_sats: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/required/i);
  });

  it("rejects amounts below minimum", async () => {
    const res = await POST(makeRequest({ amount_sats: 5, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/between/i);
  });

  it("rejects amounts above maximum", async () => {
    const res = await POST(makeRequest({ amount_sats: 200000, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/between/i);
  });

  it("rejects non-integer amounts", async () => {
    const chainMock = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 0 }),
          }),
        }),
      }),
    };
    mockFrom.mockReturnValue(chainMock);

    const res = await POST(makeRequest({ amount_sats: 10.5, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/whole number/i);
  });

  it("rejects non-string destinations", async () => {
    const res = await POST(makeRequest({ amount_sats: 100, destination: 123 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/destination must be a string/i);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
  });

  it("rejects invalid destination", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // Rate limit and daily limit checks
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: 0, data: [] }),
              }),
            }),
          }),
        };
      }
      // wallet_transactions insert
      return {
        insert: vi.fn().mockResolvedValue({ data: null }),
      };
    });

    const res = await POST(makeRequest({ amount_sats: 100, destination: "not-valid" }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/invalid destination/i);
  });

  it("prevents withdrawing more than balance", async () => {
    // User only has 50 sats
    mockGetLnBalance.mockResolvedValue(50);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: 0, data: [] }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { balance_sats: 50 } }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest({ amount_sats: 100, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/insufficient/i);
  });

  it("returns 400 when user has no LNbits wallet", async () => {
    mockGetUserLnWallet.mockResolvedValue(null);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ count: 0, data: [] }),
            }),
          }),
        }),
      };
    });

    const res = await POST(makeRequest({ amount_sats: 100, destination: "user@wallet.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no lightning wallet/i);
  });
});
