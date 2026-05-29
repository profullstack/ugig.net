import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { getUserLnWallet } from "@/lib/lightning/wallet-utils";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock("@/lib/lightning/wallet-utils", () => ({
  getUserLnWallet: vi.fn(),
}));

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockGetUserLnWallet = vi.mocked(getUserLnWallet);

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/wallet/transactions");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

async function expectLnbitsLimit(input: Record<string, string>, expected: number) {
  const expectedBase = process.env.LNBITS_URL || "https://ln.coinpayportal.com";
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
  vi.stubGlobal("fetch", fetchMock);

  mockGetAuthContext.mockResolvedValue({
    user: { id: "user-1", authMethod: "session" },
    supabase: {} as any,
  } as any);
  mockGetUserLnWallet.mockResolvedValue({
    invoice_key: "invoice-key",
  } as any);

  const res = await GET(makeRequest(input));

  expect(res.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledWith(
    `${expectedBase}/api/v1/payments?limit=${expected}`,
    { headers: { "X-Api-Key": "invoice-key" } }
  );
}

describe("GET /api/wallet/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("clamps negative limit values before calling LNbits", async () => {
    await expectLnbitsLimit({ limit: "-5" }, 1);
  });

  it("uses the default limit for non-numeric input", async () => {
    await expectLnbitsLimit({ limit: "abc" }, 50);
  });

  it("uses the default limit when the parameter is missing", async () => {
    await expectLnbitsLimit({}, 50);
  });

  it("passes through valid in-range limit values", async () => {
    await expectLnbitsLimit({ limit: "25" }, 25);
  });

  it("caps large limit values before calling LNbits", async () => {
    await expectLnbitsLimit({ limit: "999" }, 100);
  });
});
