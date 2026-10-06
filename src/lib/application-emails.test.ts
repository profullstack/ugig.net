import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: vi.fn() };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    throw new Error("not used in unit tests");
  }),
}));

import { sendEmail } from "@/lib/email";
import {
  emailApplicantsAboutStatus,
  notifyPosterOfNewApplication,
  runApplicationDigest,
  statusEmailsApplicant,
} from "./application-emails";

const mockSend = vi.mocked(sendEmail);

// ── Fake service client ──────────────────────────────────────────────

type Call = { method: string; args: unknown[] };
interface Query {
  table: string;
  calls: Call[];
}
type Resolver = (q: Query) => unknown;

function fakeSvc(resolve: Resolver, emails: Record<string, string | undefined> = {}) {
  const queries: Query[] = [];
  const from = vi.fn((table: string) => {
    const q: Query = { table, calls: [] };
    queries.push(q);
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "update", "insert", "upsert", "eq", "neq", "in", "is", "gte", "lt", "order", "range", "single"]) {
      chain[m] = (...args: unknown[]) => {
        q.calls.push({ method: m, args });
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
      Promise.resolve().then(() => resolve(q)).then(ok, err);
    return chain;
  });
  const getUserById = vi.fn(async (id: string) => ({
    data: { user: emails[id] ? { id, email: emails[id] } : null },
  }));
  return {
    client: { from, auth: { admin: { getUserById } } } as never,
    queries,
    getUserById,
  };
}

const has = (q: Query, method: string, ...args: unknown[]) =>
  q.calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args));
const updates = (queries: Query[]) =>
  queries.filter((q) => q.table === "applications" && q.calls.some((c) => c.method === "update"));

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ success: true, data: { id: "m" } } as never);
});

// ── Applicant status emails ───────────────────────────────────────────

describe("statusEmailsApplicant", () => {
  it("covers accepted, rejected and shortlisted only", () => {
    expect(["accepted", "rejected", "shortlisted"].every(statusEmailsApplicant)).toBe(true);
    expect(["pending", "reviewing", "withdrawn", "paid", "completed"].some(statusEmailsApplicant)).toBe(false);
  });
});

describe("emailApplicantsAboutStatus", () => {
  const base = { gigId: "gig-1", gigTitle: "Logo", posterName: "Pat" };

  it("emails each eligible applicant with an unsubscribe for email_application_status", async () => {
    const { client } = fakeSvc(
      (q) => {
        if (q.table === "notification_settings") return { data: [], error: null };
        if (q.table === "profiles") return { data: [{ id: "w1", full_name: "Wren", username: "wren" }], error: null };
        return { data: null, error: null };
      },
      { w1: "w1@example.test" }
    );

    const res = await emailApplicantsAboutStatus(client, [
      { ...base, applicationId: "a1", applicantId: "w1", status: "accepted" },
    ]);

    expect(res.sent).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe("w1@example.test");
    expect(arg.subject).toBe("Application Accepted! - Logo");
    expect(arg.html).toContain("Hi Wren");
    expect(arg.unsubscribe).toEqual({ userId: "w1", setting: "email_application_status" });
  });

  it("skips applicants who turned email_application_status off", async () => {
    const { client } = fakeSvc(
      (q) => {
        if (q.table === "notification_settings")
          return { data: [{ user_id: "w1", email_application_status: false }], error: null };
        return { data: [], error: null };
      },
      { w1: "w1@example.test", w2: "w2@example.test" }
    );

    const res = await emailApplicantsAboutStatus(client, [
      { ...base, applicationId: "a1", applicantId: "w1", status: "rejected" },
      { ...base, applicationId: "a2", applicantId: "w2", status: "rejected" },
    ]);

    expect(res.sent).toBe(1);
    expect(mockSend.mock.calls.map((c) => c[0].to)).toEqual(["w2@example.test"]);
  });

  it("ignores statuses that are not emailed and touches no table", async () => {
    const { client, queries } = fakeSvc(() => ({ data: [], error: null }), { w1: "w1@example.test" });
    const res = await emailApplicantsAboutStatus(client, [
      { ...base, applicationId: "a1", applicantId: "w1", status: "reviewing" },
    ]);
    expect(res.sent).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
    expect(queries).toHaveLength(0);
  });

  it("skips applicants with no email address", async () => {
    const { client } = fakeSvc(() => ({ data: [], error: null }), {});
    const res = await emailApplicantsAboutStatus(client, [
      { ...base, applicationId: "a1", applicantId: "w1", status: "shortlisted" },
    ]);
    expect(res.sent).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ── New application: instant vs digest ───────────────────────────────

describe("notifyPosterOfNewApplication", () => {
  const notice = {
    gigId: "gig-1",
    gigTitle: "Logo",
    posterId: "p1",
    posterName: "Pat",
    applicationId: "app-new",
    applicationMetadata: { source: "cli" },
    applicantName: "Wren",
    coverLetter: "I design logos",
  };
  const now = new Date("2026-10-06T12:00:00Z");

  function svcWith(settings: Record<string, unknown> | null, othersInWindow: number) {
    return fakeSvc(
      (q) => {
        if (q.table === "notification_settings") return { data: settings, error: settings ? null : { code: "PGRST116" } };
        if (q.table === "applications" && q.calls.some((c) => c.method === "update")) return { error: null };
        if (q.table === "applications") return { count: othersInWindow, error: null };
        return { data: null, error: null };
      },
      { p1: "p1@example.test" }
    );
  }

  it("sends instantly for the first application on the gig in 24h and stamps it", async () => {
    const svc = svcWith(null, 0);
    const outcome = await notifyPosterOfNewApplication(svc.client, notice, now);

    expect(outcome).toBe("instant");
    const countQuery = svc.queries.find((q) => q.table === "applications")!;
    expect(has(countQuery, "eq", "gig_id", "gig-1")).toBe(true);
    expect(has(countQuery, "neq", "id", "app-new")).toBe(true);
    expect(has(countQuery, "gte", "created_at", "2026-10-05T12:00:00.000Z")).toBe(true);
    // A held application the poster never heard about does not count.
    expect(has(countQuery, "is", "metadata->>held", null)).toBe(true);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].unsubscribe).toEqual({ userId: "p1", setting: "email_new_application" });

    const [stamp] = updates(svc.queries);
    const payload = stamp.calls.find((c) => c.method === "update")!.args[0] as { metadata: Record<string, unknown> };
    expect(payload.metadata).toEqual({
      source: "cli",
      poster_emailed: "instant",
      poster_emailed_at: "2026-10-06T12:00:00.000Z",
    });
    expect(has(stamp, "eq", "id", "app-new")).toBe(true);
  });

  it("leaves later applications for the digest", async () => {
    const svc = svcWith(null, 3);
    expect(await notifyPosterOfNewApplication(svc.client, notice, now)).toBe("digest");
    expect(mockSend).not.toHaveBeenCalled();
    expect(updates(svc.queries)).toHaveLength(0);
  });

  it("sends nothing when the poster turned email_new_application off", async () => {
    const svc = svcWith({ user_id: "p1", email_new_application: false }, 0);
    expect(await notifyPosterOfNewApplication(svc.client, notice, now)).toBe("disabled");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not stamp the application when the send fails, so the digest can retry", async () => {
    mockSend.mockResolvedValue({ success: false, error: "provider down" } as never);
    const svc = svcWith(null, 0);
    expect(await notifyPosterOfNewApplication(svc.client, notice, now)).toBe("failed");
    expect(updates(svc.queries)).toHaveLength(0);
  });
});

// ── Daily digest ──────────────────────────────────────────────────────

describe("runApplicationDigest", () => {
  const now = new Date("2026-10-07T08:00:00Z");
  const gigA = { id: "gig-a", title: "Logo", poster_id: "p1" };
  const gigB = { id: "gig-b", title: "Website", poster_id: "p1" };
  const gigC = { id: "gig-c", title: "Copy", poster_id: "p2" };

  const rows = [
    { id: "a1", gig_id: "gig-a", applicant_id: "w1", cover_letter: "first", metadata: { poster_emailed: "instant" }, created_at: "", gig: gigA },
    { id: "a2", gig_id: "gig-a", applicant_id: "w2", cover_letter: "second", metadata: null, created_at: "", gig: gigA },
    { id: "a3", gig_id: "gig-b", applicant_id: "w3", cover_letter: "third", metadata: { tx: "keep" }, created_at: "", gig: gigB },
    { id: "a4", gig_id: "gig-c", applicant_id: "w4", cover_letter: "fourth", metadata: null, created_at: "", gig: gigC },
    { id: "a5", gig_id: "gig-c", applicant_id: "w5", cover_letter: "spammy", metadata: { held: "spam_review" }, created_at: "", gig: gigC },
  ];

  function svcFor(optOuts: string[] = [], emails: Record<string, string> = { p1: "p1@example.test", p2: "p2@example.test" }) {
    return fakeSvc((q) => {
      if (q.table === "applications" && q.calls.some((c) => c.method === "update")) return { error: null };
      if (q.table === "applications") return { data: rows, error: null };
      if (q.table === "notification_settings")
        return { data: optOuts.map((id) => ({ user_id: id, email_new_application: false })), error: null };
      if (q.table === "profiles")
        return {
          data: [
            { id: "p1", full_name: "Pat", username: "pat" },
            { id: "w2", full_name: "Wren", username: "wren" },
            { id: "w3", full_name: null, username: "wolf" },
          ],
          error: null,
        };
      return { data: null, error: null };
    }, emails);
  }

  it("dry run reports what would be sent and writes nothing", async () => {
    const svc = svcFor();
    const result = await runApplicationDigest(svc.client, { dryRun: true, now });

    expect(result.dry_run).toBe(true);
    expect(result.window_start).toBe("2026-10-06T08:00:00.000Z");
    expect(result.totals).toEqual({ applications: 3, posters: 2, sent: 0, would_send: 2, skipped: 0 });
    expect(result.posters).toEqual([
      { poster_id: "p1", gigs: 2, applications: 2, outcome: "would_send" },
      { poster_id: "p2", gigs: 1, applications: 1, outcome: "would_send" },
    ]);
    expect(mockSend).not.toHaveBeenCalled();
    expect(updates(svc.queries)).toHaveLength(0);

    const listQuery = svc.queries.find((q) => q.table === "applications")!;
    expect(has(listQuery, "neq", "status", "withdrawn")).toBe(true);
    expect(has(listQuery, "is", "metadata->>held", null)).toBe(true);
    expect(has(listQuery, "gte", "created_at", "2026-10-06T08:00:00.000Z")).toBe(true);
    expect(has(listQuery, "lt", "created_at", "2026-10-07T08:00:00.000Z")).toBe(true);
  });

  it("sends one digest per poster, skipping instantly-emailed applications, and stamps them", async () => {
    const svc = svcFor();
    const result = await runApplicationDigest(svc.client, { now });

    expect(result.totals.sent).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
    const toP1 = mockSend.mock.calls.find((c) => c[0].to === "p1@example.test")![0];
    expect(toP1.subject).toBe("2 new applications on 2 gigs - ugig.net");
    expect(toP1.html).toContain("Wren");
    expect(toP1.html).toContain("wolf");
    expect(toP1.html).not.toContain("first"); // a1 was already emailed instantly
    expect(toP1.unsubscribe).toEqual({ userId: "p1", setting: "email_new_application" });

    const stamped = updates(svc.queries).map((q) => {
      const id = q.calls.find((c) => c.method === "eq")!.args[1];
      const meta = (q.calls.find((c) => c.method === "update")!.args[0] as { metadata: Record<string, unknown> }).metadata;
      return { id, meta };
    });
    expect(stamped.map((s) => s.id).sort()).toEqual(["a2", "a3", "a4"]);
    expect(stamped.find((s) => s.id === "a3")!.meta).toEqual({
      tx: "keep",
      poster_emailed: "digest",
      poster_emailed_at: "2026-10-07T08:00:00.000Z",
    });
  });

  it("respects email_new_application and missing addresses", async () => {
    const svc = svcFor(["p2"], { p1: "p1@example.test" });
    const result = await runApplicationDigest(svc.client, { now });
    // p2 opted out; p1 is sent
    expect(result.posters.find((p) => p.poster_id === "p2")!.outcome).toBe("disabled");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(updates(svc.queries).map((q) => q.calls.find((c) => c.method === "eq")!.args[1]).sort()).toEqual(["a2", "a3"]);
  });

  it("leaves applications unstamped when the digest send fails", async () => {
    mockSend.mockResolvedValue({ success: false, error: "down" } as never);
    const svc = svcFor();
    const result = await runApplicationDigest(svc.client, { now });
    expect(result.totals.sent).toBe(0);
    expect(result.posters.every((p) => p.outcome === "failed")).toBe(true);
    expect(updates(svc.queries)).toHaveLength(0);
  });

  it("throws when the applications query fails", async () => {
    const svc = fakeSvc(() => ({ data: null, error: { message: "boom" } }));
    await expect(runApplicationDigest(svc.client, { now })).rejects.toThrow(/boom/);
  });
});
