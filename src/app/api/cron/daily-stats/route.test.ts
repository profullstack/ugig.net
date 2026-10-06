import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSend = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  }),
}));

import { POST } from "./route";

// ── Helpers ────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}, query = "") {
  return new NextRequest(`http://localhost/api/cron/daily-stats${query}`, {
    method: "POST",
    headers,
  });
}

type Result = { count?: number | null; data?: unknown; error?: unknown };

/** A PostgREST-ish builder: every method chains, awaiting it yields `result`. */
function builder(result: Result) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "gte", "order", "limit"]) {
    b[m] = vi.fn(() => b);
  }
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? [], count: result.count ?? null, error: result.error ?? null }).then(
      resolve,
      reject
    );
  return b;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  mockSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

// ════════════════════════════════════════════════════════════════════
//  POST /api/cron/daily-stats
// ════════════════════════════════════════════════════════════════════

describe("POST /api/cron/daily-stats", () => {
  it("returns 401 without cron secret", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong cron secret", async () => {
    const res = await POST(makeRequest({ "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is unset, even for an empty header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(makeRequest({ authorization: "Bearer " }));
    expect(res.status).toBe(401);
  });

  it("sends the report with real counts", async () => {
    mockFrom.mockImplementation((table: string) =>
      builder({ count: table === "profiles" ? 2238 : 7, data: [] })
    );

    const res = await POST(makeRequest({ authorization: "Bearer test-secret" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sent).toBe(true);
    expect(json.id).toBe("email-1");
    expect(json.subject).toContain("2238 users");
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].to).toBe("anthony@profullstack.com");
  });

  it("does NOT send, and returns 500, when a query errors (no silent zeros)", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "messages"
        ? builder({ error: { message: "TypeError: fetch failed" } })
        : builder({ count: 5, data: [] })
    );

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.sent).toBe(false);
    expect(json.error).toContain("messages");
    expect(json.error).toContain("fetch failed");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does NOT send when every table reports zero users (wrong database)", async () => {
    mockFrom.mockImplementation(() => builder({ count: 0, data: [] }));

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toContain("profiles");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does NOT send when a count comes back null", async () => {
    mockFrom.mockImplementation((table: string) =>
      builder({ count: table === "gigs" ? null : 3, data: [] })
    );

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("dry_run=1 returns counts and sends nothing", async () => {
    mockFrom.mockImplementation(() => builder({ count: 12, data: [] }));

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }, "?dry_run=1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.dry_run).toBe(true);
    expect(json.stats.users.total).toBe(12);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("escapes user-supplied names in the HTML", async () => {
    mockFrom.mockImplementation((table: string) =>
      builder({
        count: 4,
        data:
          table === "profiles"
            ? [{ username: "x", full_name: "<script>alert(1)</script>", created_at: "2026-09-29T00:00:00Z" }]
            : [],
      })
    );

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    expect(res.status).toBe(200);
    const html: string = mockSend.mock.calls[0][0].html;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("reports gig invoices (where gig money moves) and splits jobs from for-hire ads", async () => {
    const builders: { table: string; b: ReturnType<typeof builder> }[] = [];
    mockFrom.mockImplementation((table: string) => {
      const b = builder({ count: table === "gig_invoices" ? 267 : 3, data: [] });
      builders.push({ table, b });
      return b;
    });

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }, "?dry_run=1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.stats.invoices.paid).toBe(267);
    expect(json.stats.gigs.activeHiring).toBe(3);
    expect(json.stats.users.spamFlagged).toBe(3);

    const eqCalls = builders.flatMap(({ table, b }) =>
      (b.eq as ReturnType<typeof vi.fn>).mock.calls.map((c) => `${table}.${c[0]}=${c[1]}`)
    );
    expect(eqCalls).toContain("gig_invoices.status=paid");
    expect(eqCalls).toContain("gigs.listing_type=hiring");
    expect(eqCalls).toContain("gigs.listing_type=for_hire");
    expect(eqCalls).toContain("profiles.is_spam=true");

    const inCalls = builders.flatMap(({ table, b }) =>
      (b.in as ReturnType<typeof vi.fn>).mock.calls.map((c) => `${table}.${c[0]}=${[...c[1]].join("|")}`)
    );
    expect(inCalls).toContain("applications.status=accepted|in_progress|completed|paid");
  });

  it("labels the payments table as checkouts, not gig payments", async () => {
    mockFrom.mockImplementation(() => builder({ count: 9, data: [] }));
    await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    const text: string = mockSend.mock.calls[0][0].text;
    expect(text).toContain("GIG INVOICES");
    expect(text).toContain("PRO / FUNDING / TIP CHECKOUTS");
    expect(text).toContain("for-hire ads");
  });

  it("returns 502 when Resend rejects the send", async () => {
    mockFrom.mockImplementation(() => builder({ count: 9, data: [] }));
    mockSend.mockResolvedValue({ data: null, error: { message: "domain not verified" } });

    const res = await POST(makeRequest({ "x-cron-secret": "test-secret" }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.sent).toBe(false);
  });
});
