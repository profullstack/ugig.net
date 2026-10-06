import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const svcFrom = vi.fn();

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({ from: svcFrom })),
}));

vi.mock("@/lib/application-emails", () => ({
  emailApplicantsAboutStatusInBackground: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import { emailApplicantsAboutStatusInBackground } from "@/lib/application-emails";
const mockGetAuthContext = vi.mocked(getAuthContext);
const mockEmailApplicants = vi.mocked(emailApplicantsAboutStatusInBackground);

const routeParams = { params: Promise.resolve({ id: "gig-1" }) };
const request = () =>
  new NextRequest("http://localhost/api/gigs/gig-1/applications/approve-all", { method: "POST" });

function gigChain(gig: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: gig, error: null });
  return chain;
}

function updateChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.select = vi.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/gigs/[id]/applications/approve-all", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(request(), routeParams);
    expect(res.status).toBe(401);
  });

  it("returns 403 for someone else's gig and emails nobody", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "intruder" } } as never);
    svcFrom.mockReturnValue(gigChain({ poster_id: "poster-1", title: "Gig", poster: null }));
    const res = await POST(request(), routeParams);
    expect(res.status).toBe(403);
    expect(mockEmailApplicants).not.toHaveBeenCalled();
  });

  it("accepts every pending application and emails each applicant (gated)", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "poster-1" } } as never);
    const update = updateChain({
      data: [
        { id: "app-1", applicant_id: "worker-1" },
        { id: "app-2", applicant_id: "worker-2" },
      ],
      error: null,
    });
    svcFrom.mockImplementation((table: string) =>
      table === "gigs"
        ? gigChain({
            poster_id: "poster-1",
            title: "Data labelling",
            poster: { full_name: null, username: "poster" },
          })
        : update
    );

    const res = await POST(request(), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.approved).toBe(2);
    expect(update.update).toHaveBeenCalledWith({ status: "accepted" });
    expect(update.eq).toHaveBeenCalledWith("status", "pending");
    // Applications held for spam review are never approved (or emailed).
    expect(update.is).toHaveBeenCalledWith("metadata->>held", null);
    expect(mockEmailApplicants).toHaveBeenCalledWith([
      {
        applicationId: "app-1",
        applicantId: "worker-1",
        gigId: "gig-1",
        gigTitle: "Data labelling",
        posterName: "poster",
        status: "accepted",
      },
      {
        applicationId: "app-2",
        applicantId: "worker-2",
        gigId: "gig-1",
        gigTitle: "Data labelling",
        posterName: "poster",
        status: "accepted",
      },
    ]);
  });

  it("emails nobody when the update fails", async () => {
    mockGetAuthContext.mockResolvedValue({ user: { id: "poster-1" } } as never);
    svcFrom.mockImplementation((table: string) =>
      table === "gigs"
        ? gigChain({ poster_id: "poster-1", title: "Gig", poster: null })
        : updateChain({ data: null, error: { message: "nope" } })
    );
    const res = await POST(request(), routeParams);
    expect(res.status).toBe(400);
    expect(mockEmailApplicants).not.toHaveBeenCalled();
  });
});
