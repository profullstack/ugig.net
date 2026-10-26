import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockGetAuthContext = vi.fn();
const mockRedeem = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: (...a: unknown[]) => mockGetAuthContext(...a) }));
vi.mock("@/lib/credits", () => ({ redeemCreditCode: (...a: unknown[]) => mockRedeem(...a) }));

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/credits/redeem", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/credits/redeem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without auth", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    expect((await POST(req({ code: "x" }))).status).toBe(401);
  });

  it("400 without a code", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "u1" } });
    expect((await POST(req({}))).status).toBe(400);
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it("passes the refusal reason through", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "u2" } });
    mockRedeem.mockResolvedValue({ ok: false, reason: "used_up", message: "That code has already been used." });
    const res = await POST(req({ code: "CR-1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "used_up" });
  });

  it("returns the granted days", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "u3" } });
    mockRedeem.mockResolvedValue({ ok: true, days: 30, currentPeriodEnd: "2026-11-25T00:00:00Z" });
    const res = await POST(req({ code: "CR-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ granted: { unit: "pro_days", amount: 30 }, plan: "pro" });
    expect(mockRedeem).toHaveBeenCalledWith("u3", "CR-1");
  });
});
