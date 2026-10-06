import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PUT } from "./route";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/application-emails", () => ({
  emailApplicantsAboutStatusInBackground: vi.fn(),
}));
import { emailApplicantsAboutStatusInBackground } from "@/lib/application-emails";
const mockEmailApplicants = vi.mocked(emailApplicantsAboutStatusInBackground);

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

  describe("applicant status emails", () => {
    const idA = "11111111-1111-4111-8111-111111111111";
    const idB = "22222222-2222-4222-8222-222222222222";
    const gig = {
      id: "gig-1",
      poster_id: "poster-1",
      title: "Landing page",
      poster: { full_name: "Pat Poster", username: "pat" },
    };

    function setup(rows: { id: string; applicant_id: string; status: string }[], updatedIds: string[]) {
      const applicationsIn = vi.fn().mockResolvedValue({
        data: rows.map((r) => ({ ...r, gig_id: "gig-1", gig })),
        error: null,
      });
      const updateSelect = vi.fn().mockResolvedValue({
        data: updatedIds.map((id) => ({ id })),
        error: null,
      });
      const update = vi.fn(() => ({ in: vi.fn(() => ({ select: updateSelect })) }));
      const notificationsInsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === "applications") {
          return { select: vi.fn(() => ({ in: applicationsIn })), update };
        }
        if (table === "notifications") return { insert: notificationsInsert };
        throw new Error(`Unexpected table: ${table}`);
      });
      return { notificationsInsert };
    }

    it("emails applicants whose status changed to rejected, and inserts no notifications", async () => {
      const { notificationsInsert } = setup(
        [
          { id: idA, applicant_id: "worker-a", status: "pending" },
          { id: idB, applicant_id: "worker-b", status: "rejected" },
        ],
        [idA, idB]
      );

      const res = await PUT(
        makeRequest(JSON.stringify({ application_ids: [idA, idB], status: "rejected" }))
      );

      expect(res.status).toBe(200);
      // The DB trigger owns the in-app notification for rejected.
      expect(notificationsInsert).not.toHaveBeenCalled();
      expect(mockEmailApplicants).toHaveBeenCalledTimes(1);
      // worker-b was already rejected, so only worker-a hears about it.
      expect(mockEmailApplicants).toHaveBeenCalledWith([
        {
          applicationId: idA,
          applicantId: "worker-a",
          gigId: "gig-1",
          gigTitle: "Landing page",
          posterName: "Pat Poster",
          status: "rejected",
        },
      ]);
    });

    it("hands shortlisted changes to the email too", async () => {
      setup([{ id: idA, applicant_id: "worker-a", status: "reviewing" }], [idA]);

      await PUT(makeRequest(JSON.stringify({ application_ids: [idA], status: "shortlisted" })));

      expect(mockEmailApplicants).toHaveBeenCalledWith([
        expect.objectContaining({ applicantId: "worker-a", status: "shortlisted" }),
      ]);
    });

    it("skips applications the update did not touch", async () => {
      setup([{ id: idA, applicant_id: "worker-a", status: "pending" }], []);

      await PUT(makeRequest(JSON.stringify({ application_ids: [idA], status: "accepted" })));

      expect(mockEmailApplicants).toHaveBeenCalledWith([]);
    });
  });
});
