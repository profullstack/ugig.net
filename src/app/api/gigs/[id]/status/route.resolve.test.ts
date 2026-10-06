import { describe, it, expect, vi, beforeEach } from "vitest";

// The free post cap (lib/gig-usage) has its own tests; these cover other rules.
vi.mock("@/lib/gig-usage", () => ({
  getGigPostAllowance: vi.fn(async () => ({ allowed: true })),
  recordGigPost: vi.fn(async () => {}),
  GIG_POST_LIMIT_MESSAGE: "limit",
}));
import { NextRequest } from "next/server";
import { PATCH } from "./route";

const mockFrom = vi.fn();
const supabaseClient = { from: mockFrom, rpc: vi.fn().mockResolvedValue({ error: null }) };

const getUserById = vi.fn().mockResolvedValue({ data: { user: { email: "poster@example.test" } } });

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(() => ({ auth: { admin: { getUserById } } })),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({ dispatchWebhookAsync: vi.fn() }));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  gigFilledEmail: vi.fn(() => ({ subject: "s", html: "<html></html>", text: "t" })),
}));

vi.mock("@/lib/notification-settings", () => ({
  isEmailNotificationEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/application-resolution", () => ({
  rejectOpenApplications: vi.fn(),
}));

vi.mock("@/lib/application-emails", () => ({
  emailApplicantsAboutStatusInBackground: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import { sendEmail } from "@/lib/email";
import { isEmailNotificationEnabled } from "@/lib/notification-settings";
import { rejectOpenApplications } from "@/lib/application-resolution";
import { emailApplicantsAboutStatusInBackground } from "@/lib/application-emails";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockReject = vi.mocked(rejectOpenApplications);
const mockEmailApplicants = vi.mocked(emailApplicantsAboutStatusInBackground);

const routeParams = { params: Promise.resolve({ id: "gig-1" }) };
const request = (status: string) =>
  new NextRequest("http://localhost/api/gigs/gig-1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  for (const m of ["select", "update", "eq", "in"]) c[m] = vi.fn(() => c);
  c.single = vi.fn().mockResolvedValue(result);
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

function setupGig(oldStatus: string) {
  mockGetAuthContext.mockResolvedValue({ user: { id: "poster-1" }, supabase: supabaseClient } as never);
  let gigCalls = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "gigs") {
      gigCalls++;
      return gigCalls === 1
        ? chain({
            data: {
              poster_id: "poster-1",
              status: oldStatus,
              created_at: "2026-10-01T00:00:00Z",
              title: "Video edit",
              poster: { full_name: "Pat", username: "pat" },
            },
            error: null,
          })
        : chain({ data: { id: "gig-1", status: "updated" }, error: null });
    }
    // applications hired count for the filled email
    return chain({ count: 1, error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReject.mockResolvedValue([
    { id: "app-1", applicant_id: "worker-1", previous_status: "pending" },
    { id: "app-2", applicant_id: "worker-2", previous_status: "shortlisted" },
  ]);
});

describe("PATCH /api/gigs/[id]/status: resolving open applications", () => {
  it("rejects open applications with reason gig_closed when the gig is closed", async () => {
    setupGig("active");
    const res = await PATCH(request("closed"), routeParams);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockReject).toHaveBeenCalledWith(supabaseClient, "gig-1", "gig_closed");
    expect(json.resolved_applications).toBe(2);
    expect(mockEmailApplicants).toHaveBeenCalledWith([
      {
        applicationId: "app-1",
        applicantId: "worker-1",
        gigId: "gig-1",
        gigTitle: "Video edit",
        posterName: "Pat",
        status: "rejected",
      },
      {
        applicationId: "app-2",
        applicantId: "worker-2",
        gigId: "gig-1",
        gigTitle: "Video edit",
        posterName: "Pat",
        status: "rejected",
      },
    ]);
  });

  it("uses reason gig_filled when the gig is filled", async () => {
    setupGig("active");
    const res = await PATCH(request("filled"), routeParams);
    expect(res.status).toBe(200);
    expect(mockReject).toHaveBeenCalledWith(supabaseClient, "gig-1", "gig_filled");
  });

  it.each(["paused", "draft", "active"])("leaves applications alone when the gig becomes %s", async (status) => {
    setupGig(status === "active" ? "paused" : "active");
    const res = await PATCH(request(status), routeParams);
    expect(res.status).toBe(200);
    expect(mockReject).not.toHaveBeenCalled();
    expect(mockEmailApplicants).not.toHaveBeenCalled();
  });

  it("does nothing when the gig was already closed", async () => {
    setupGig("closed");
    await PATCH(request("closed"), routeParams);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("still succeeds when resolving applications throws", async () => {
    setupGig("active");
    mockReject.mockRejectedValue(new Error("db down"));
    const res = await PATCH(request("closed"), routeParams);
    expect(res.status).toBe(200);
    expect(mockEmailApplicants).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/gigs/[id]/status: gig filled email", () => {
  it("sends the filled email with an unsubscribe for email_gig_updates", async () => {
    setupGig("active");
    await PATCH(request("filled"), routeParams);
    expect(isEmailNotificationEnabled).toHaveBeenCalledWith(expect.anything(), "poster-1", "email_gig_updates");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "poster@example.test",
        unsubscribe: { userId: "poster-1", setting: "email_gig_updates" },
      })
    );
  });

  it("skips the filled email when email_gig_updates is off", async () => {
    setupGig("active");
    vi.mocked(isEmailNotificationEnabled).mockResolvedValueOnce(false);
    await PATCH(request("filled"), routeParams);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
