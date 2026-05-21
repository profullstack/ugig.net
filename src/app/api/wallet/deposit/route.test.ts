import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: any[]) => mockGetAuthContext(...args),
}));

const mockCreateServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

const mockGetUserLnWallet = vi.fn();
const mockCreateInvoice = vi.fn();
const mockGetLnBalance = vi.fn();
vi.mock("@/lib/lightning/wallet-utils", () => ({
  getUserLnWallet: (...args: any[]) => mockGetUserLnWallet(...args),
  createInvoice: (...args: any[]) => mockCreateInvoice(...args),
  getLnBalance: (...args: any[]) => mockGetLnBalance(...args),
}));

import { POST } from "./route";

function makeRequest(body: any) {
  return new Request("http://localhost/api/wallet/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

function makeRawRequest(body: string) {
  return new Request("http://localhost/api/wallet/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }) as any;
}

describe("POST /api/wallet/deposit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-12345678" } });
    mockGetUserLnWallet.mockResolvedValue({
      invoice_key: "invoice-key-123",
    });
    mockCreateInvoice.mockResolvedValue({
      payment_request: "lnbc123",
      payment_hash: "hash-123",
    });
    mockGetLnBalance.mockResolvedValue(250);
  });

  it("rejects unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(makeRequest({ amount_sats: 100 }));

    expect(res.status).toBe(401);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without creating an invoice", async () => {
    const res = await POST(makeRawRequest("{not valid json"));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it("rejects non-object JSON bodies without creating an invoice", async () => {
    const res = await POST(makeRequest(null));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it("rejects non-integer amounts without wallet lookup", async () => {
    const res = await POST(makeRequest({ amount_sats: 100.5 }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid amount (1-1,000,000 sats)");
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
  });

  it("creates an invoice for a valid deposit amount", async () => {
    const walletSelectSingle = vi.fn().mockResolvedValue({
      data: { id: "wallet-1", balance_sats: 250 },
    });
    const walletEq = vi.fn().mockReturnValue({ single: walletSelectSingle });
    const walletSelect = vi.fn().mockReturnValue({ eq: walletEq });
    const transactionInsert = vi.fn().mockResolvedValue({ data: null });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "wallets") {
          return {
            select: walletSelect,
            insert: vi.fn().mockResolvedValue({ data: null }),
          };
        }
        if (table === "wallet_transactions") {
          return { insert: transactionInsert };
        }
        return {};
      }),
    };
    mockCreateServiceClient.mockReturnValue(admin);

    const res = await POST(makeRequest({ amount_sats: 100 }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      payment_request: "lnbc123",
      payment_hash: "hash-123",
      amount_sats: 100,
    });
    expect(mockCreateInvoice).toHaveBeenCalledWith(
      "invoice-key-123",
      100,
      "ugig.net deposit (user-123)",
    );
    expect(transactionInsert).toHaveBeenCalledWith({
      user_id: "user-12345678",
      type: "deposit",
      amount_sats: 100,
      balance_after: 250,
      bolt11: "lnbc123",
      payment_hash: "hash-123",
      status: "pending",
    });
  });
});
