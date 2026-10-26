import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockGetAuthContext = vi.fn();
const mockAccept = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({ getAuthContext: (...a: unknown[]) => mockGetAuthContext(...a) }));
vi.mock("@/lib/credits", () => ({ INVITE_BONUS_PRO_DAYS: 7, acceptInvite: (...a: unknown[]) => mockAccept(...a) }));

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/invites/accept", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/invites/accept", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 without auth", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    expect((await POST(req({ code: "INV-1" }))).status).toBe(401);
  });

  it("400 with the reason when refused", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "a1" } });
    mockAccept.mockResolvedValue({ ok: false, reason: "not_new", message: "Invites are for new accounts" });
    const res = await POST(req({ code: "INV-1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ reason: "not_new" });
  });

  it("reports a pending bonus", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "a2" } });
    mockAccept.mockResolvedValue({ ok: true, bonus: "pending", inviterId: "x", inviteId: "y" });
    const res = await POST(req({ code: "INV-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bonus: "pending", bonus_days: 7 });
  });
});
