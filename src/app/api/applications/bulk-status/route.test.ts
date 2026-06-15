import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

const mockFrom = vi.fn();

function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/applications/bulk-status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("PUT /api/applications/bulk-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: "poster-1" },
      supabase: { from: mockFrom },
    });
  });

  it("returns 400 for malformed JSON without querying Supabase", async () => {
    const res = await PUT(makeRequest("{"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 404 when any requested application id is missing", async () => {
    const existingId = "11111111-1111-4111-8111-111111111111";
    const missingId = "22222222-2222-4222-8222-222222222222";
    const applicationsIn = vi.fn().mockResolvedValue({
      data: [
        {
          id: existingId,
          applicant_id: "worker-1",
          gig_id: "gig-1",
          gig: { poster_id: "poster-1" },
        },
      ],
      error: null,
    });
    const applicationsSelect = vi.fn(() => ({ in: applicationsIn }));
    const applicationsUpdate = vi.fn();
    const notificationsInsert = vi.fn();

    mockFrom.mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          select: applicationsSelect,
          update: applicationsUpdate,
        };
      }

      if (table === "notifications") {
        return { insert: notificationsInsert };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await PUT(
      makeRequest(
        JSON.stringify({
          application_ids: [existingId, missingId],
          status: "accepted",
        })
      )
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Some applications were not found",
    });
    expect(applicationsIn).toHaveBeenCalledWith("id", [existingId, missingId]);
    expect(applicationsUpdate).not.toHaveBeenCalled();
    expect(notificationsInsert).not.toHaveBeenCalled();
  });
});
