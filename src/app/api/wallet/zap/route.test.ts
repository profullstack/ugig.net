import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockCreateServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

const mockGetUserLnWallet = vi.fn();
const mockGetLnBalance = vi.fn();
const mockInternalTransfer = vi.fn();
const mockSyncBalanceCache = vi.fn();
vi.mock("@/lib/lightning/wallet-utils", () => ({
  getUserLnWallet: (...args: unknown[]) => mockGetUserLnWallet(...args),
  getLnBalance: (...args: unknown[]) => mockGetLnBalance(...args),
  internalTransfer: (...args: unknown[]) => mockInternalTransfer(...args),
  syncBalanceCache: (...args: unknown[]) => mockSyncBalanceCache(...args),
}));

const mockGetUserDid = vi.fn();
const mockOnZapSent = vi.fn();
const mockOnZapReceived = vi.fn();
vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: (...args: unknown[]) => mockGetUserDid(...args),
  onZapSent: (...args: unknown[]) => mockOnZapSent(...args),
  onZapReceived: (...args: unknown[]) => mockOnZapReceived(...args),
}));

import { POST } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/wallet/zap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function makeJsonRequest(body: unknown) {
  return makeRequest(JSON.stringify(body));
}

describe("POST /api/wallet/zap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ user: { id: USER_ID } });
  });

  it("rejects unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await POST(makeJsonRequest({}));

    expect(res.status).toBe(401);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before wallet work", async () => {
    const res = await POST(makeRequest("{not valid json"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request body" });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
    expect(mockInternalTransfer).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object JSON before wallet work", async () => {
    const res = await POST(makeJsonRequest("not an object"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid request body" });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockGetUserLnWallet).not.toHaveBeenCalled();
  });

  it("keeps valid JSON on the existing validation path", async () => {
    const res = await POST(
      makeJsonRequest({
        recipient_id: USER_ID,
        amount_sats: 10,
        target_type: "post",
        target_id: "post-1",
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cannot zap yourself" });
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });
});
