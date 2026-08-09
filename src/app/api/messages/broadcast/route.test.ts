import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  newMessageEmail: vi.fn(() => ({
    subject: "test",
    text: "test",
    html: "test",
  })),
}));

vi.mock("@/lib/webhooks/dispatch", () => ({
  dispatchWebhookAsync: vi.fn(),
}));

import { getAuthContext, createServiceClient } from "@/lib/auth/get-user";
import { dispatchWebhookAsync } from "@/lib/webhooks/dispatch";
import { sendEmail } from "@/lib/email";
import { GET, POST } from "./route";

const mockGetAuthContext = vi.mocked(getAuthContext);
const mockCreateServiceClient = vi.mocked(createServiceClient);

const SENDER = "00000000-0000-4000-a000-00000000000a";
const APPLICANT_1 = "00000000-0000-4000-a000-000000000001";
const APPLICANT_2 = "00000000-0000-4000-a000-000000000002";
const SUBMITTER_1 = "00000000-0000-4000-a000-000000000003";
const CONVERSATION_ID = "00000000-0000-4000-a000-0000000000c0";
const MESSAGE_ID = "00000000-0000-4000-a000-0000000000m0".replace(/m/g, "b");

/**
 * Minimal chainable Supabase stub. `tables` maps a table name to the rows the
 * builder resolves with; `overrides` lets a test pin a specific terminal call.
 */
function makeServiceClient(options: {
  isAdmin?: boolean;
  gigs?: { id: string }[];
  applications?: { applicant_id: string }[];
  bounties?: { id: string }[];
  bountySubmissions?: { submitter_id: string }[];
  profilesAll?: { id: string }[];
  existingConversation?: { id: string; participant_ids: string[] } | null;
  notificationSettings?: Record<string, unknown>[];
}) {
  const {
    isAdmin = false,
    gigs = [],
    applications = [],
    bounties = [],
    bountySubmissions = [],
    profilesAll = [],
    existingConversation = null,
    notificationSettings = [],
  } = options;

  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, unknown[]> = {};

  function builder(table: string) {
    let selectedColumns = "";
    let profileFilterId: string | null = null;

    const chain: Record<string, unknown> = {};

    const resolveData = () => {
      switch (table) {
        case "gigs":
          return gigs;
        case "applications":
          return applications;
        case "bounties":
          return bounties;
        case "bounty_submissions":
          return bountySubmissions;
        case "notification_settings":
          return notificationSettings;
        case "profiles":
          // is_admin lookup / sender name lookup / bulk-name lookup
          if (selectedColumns.includes("is_admin")) {
            return [{ is_admin: isAdmin }];
          }
          if (selectedColumns.includes("full_name")) {
            return profileFilterId
              ? [{ full_name: "Anthony", username: "anthony" }]
              : profilesAll.map((p) => ({
                  id: p.id,
                  full_name: null,
                  username: "user",
                }));
          }
          return profilesAll;
        case "conversations":
          return existingConversation ? [existingConversation] : [];
        default:
          return [];
      }
    };

    const terminal = () => Promise.resolve({ data: resolveData(), error: null });

    const passthrough = (name: string) => {
      chain[name] = (...args: unknown[]) => {
        if (name === "select") selectedColumns = String(args[0] ?? "");
        if (name === "eq" && args[0] === "id") profileFilterId = String(args[1]);
        return chain;
      };
    };

    for (const name of ["select", "eq", "in", "order", "range", "contains", "is", "not", "lt"]) {
      passthrough(name);
    }

    chain.insert = (rows: unknown) => {
      inserted[table] ??= [];
      inserted[table].push(rows);
      return {
        select: () => ({
          single: () =>
            Promise.resolve({
              data: table === "conversations" ? { id: CONVERSATION_ID } : { id: MESSAGE_ID },
              error: null,
            }),
        }),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      };
    };

    chain.update = (values: unknown) => {
      updated[table] ??= [];
      updated[table].push(values);
      return {
        eq: () => Promise.resolve({ data: null, error: null }),
      };
    };

    chain.maybeSingle = () => {
      const rows = resolveData() as unknown[];
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    };
    chain.single = () => {
      const rows = resolveData() as unknown[];
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    };
    chain.then = (resolve: (v: unknown) => void) => terminal().then(resolve);

    return chain;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({
          data: {
            users: [
              { id: APPLICANT_1, email: "a1@example.com" },
              { id: APPLICANT_2, email: "a2@example.com" },
              { id: SUBMITTER_1, email: "s1@example.com" },
            ],
          },
          error: null,
        }),
      },
    },
    __inserted: inserted,
    __updated: updated,
  };
}

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/messages/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new NextRequest("http://localhost/api/messages/broadcast");
}

function authAs(userId: string) {
  mockGetAuthContext.mockResolvedValue({ user: { id: userId } } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/messages/broadcast", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(postRequest({ content: "hi", audience: "my_people" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty message", async () => {
    authAs(SENDER);

    mockCreateServiceClient.mockReturnValue(makeServiceClient({}) as any);
    const res = await POST(postRequest({ content: "   ", audience: "my_people" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown audience", async () => {
    authAs(SENDER);

    mockCreateServiceClient.mockReturnValue(makeServiceClient({}) as any);
    const res = await POST(postRequest({ content: "hi", audience: "everyone" }));
    expect(res.status).toBe(400);
  });

  it("forbids all_users for non-admins", async () => {
    authAs(SENDER);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ isAdmin: false }) as any);
    const res = await POST(postRequest({ content: "hi", audience: "all_users" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/admin only/i);
  });

  it("returns 400 when the audience is empty", async () => {
    authAs(SENDER);
    mockCreateServiceClient.mockReturnValue(
      makeServiceClient({ gigs: [], applications: [] }) as any
    );
    const res = await POST(postRequest({ content: "hi", audience: "gig_applicants" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no recipients/i);
  });

  it("unions gig applicants and bounty submitters, de-duplicated", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [
        { applicant_id: APPLICANT_1 },
        { applicant_id: APPLICANT_2 },
        { applicant_id: APPLICANT_1 }, // duplicate across gigs
      ],
      bounties: [{ id: "bounty-1" }],
      bountySubmissions: [
        { submitter_id: SUBMITTER_1 },
        { submitter_id: APPLICANT_1 }, // also applied to a gig
      ],
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(postRequest({ content: "how's it going?", audience: "my_people" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recipients).toBe(3);
    expect(body.conversation_id).toBe(CONVERSATION_ID);
    expect(body.truncated).toBe(false);
  });

  it("excludes the sender from their own broadcast", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [{ applicant_id: APPLICANT_1 }, { applicant_id: SENDER }],
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(postRequest({ content: "hi", audience: "gig_applicants" }));
    expect((await res.json()).recipients).toBe(1);
  });

  it("marks the new conversation as a broadcast owned by the sender", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [{ applicant_id: APPLICANT_1 }],
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    await POST(postRequest({ content: "hi", audience: "gig_applicants" }));

    const convInsert = svc.__inserted.conversations?.[0] as Record<string, unknown>;
    expect(convInsert.is_broadcast).toBe(true);
    expect(convInsert.broadcast_owner_id).toBe(SENDER);
    expect(convInsert.broadcast_audience).toBe("gig_applicants");
    expect(convInsert.participant_ids).toContain(SENDER);
    expect(convInsert.participant_ids).toContain(APPLICANT_1);
  });

  it("reuses an existing thread for the same audience instead of creating one", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [{ applicant_id: APPLICANT_1 }],
      existingConversation: {
        id: CONVERSATION_ID,
        participant_ids: [SENDER, APPLICANT_1],
      },
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(postRequest({ content: "second send", audience: "gig_applicants" }));

    expect((await res.json()).conversation_id).toBe(CONVERSATION_ID);
    expect(svc.__inserted.conversations).toBeUndefined();
    const convUpdates = svc.__updated.conversations as Record<string, unknown>[];
    expect(convUpdates.some((update) => "participant_ids" in update)).toBe(false);
  });

  it("creates a separate thread when the audience roster changes", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [{ applicant_id: APPLICANT_1 }],
      existingConversation: {
        id: CONVERSATION_ID,
        participant_ids: [SENDER, APPLICANT_2],
      },
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(postRequest({ content: "new audience", audience: "gig_applicants" }));

    expect(res.status).toBe(200);
    const convInsert = svc.__inserted.conversations?.[0] as Record<string, unknown>;
    expect(convInsert.participant_ids).toEqual([APPLICANT_1, SENDER].sort());
    const convUpdates = svc.__updated.conversations as Record<string, unknown>[];
    expect(convUpdates.some((update) => "participant_ids" in update)).toBe(false);
  });

  it("notifies, webhooks, and emails every recipient", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [{ applicant_id: APPLICANT_1 }, { applicant_id: APPLICANT_2 }],
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(postRequest({ content: "feedback please", audience: "gig_applicants" }));
    const body = await res.json();

    const notifications = svc.__inserted.notifications?.[0] as unknown[];
    expect(notifications).toHaveLength(2);
    expect(dispatchWebhookAsync).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(body.emailed).toBe(2);
  });

  it("skips email for recipients who opted out of message emails", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      gigs: [{ id: "gig-1" }],
      applications: [{ applicant_id: APPLICANT_1 }, { applicant_id: APPLICANT_2 }],
      notificationSettings: [{ user_id: APPLICANT_2, email_new_message: false }],
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(postRequest({ content: "hi", audience: "gig_applicants" }));
    const body = await res.json();

    // Still messaged in-app, just not emailed.
    expect(body.recipients).toBe(2);
    expect(body.emailed).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("allows all_users for admins", async () => {
    authAs(SENDER);
    const svc = makeServiceClient({
      isAdmin: true,
      profilesAll: [{ id: APPLICANT_1 }, { id: APPLICANT_2 }, { id: SENDER }],
    });

    mockCreateServiceClient.mockReturnValue(svc as any);

    const res = await POST(
      postRequest({ content: "how is ugig working for you?", audience: "all_users" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // Sender excluded from the platform-wide list.
    expect(body.recipients).toBe(2);
  });
});

describe("GET /api/messages/broadcast", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("hides admin-only audiences from non-admins", async () => {
    authAs(SENDER);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ isAdmin: false }) as any);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(body.is_admin).toBe(false);
    expect(body.audiences).not.toContain("all_users");
    expect(body.audiences).toContain("gig_applicants");
  });

  it("exposes all_users and per-audience counts to admins", async () => {
    authAs(SENDER);
    mockCreateServiceClient.mockReturnValue(
      makeServiceClient({
        isAdmin: true,
        gigs: [{ id: "gig-1" }],
        applications: [{ applicant_id: APPLICANT_1 }, { applicant_id: APPLICANT_2 }],
        profilesAll: [{ id: APPLICANT_1 }, { id: APPLICANT_2 }, { id: SENDER }],
      }) as any
    );

    const res = await GET(getRequest());
    const body = await res.json();

    expect(body.is_admin).toBe(true);
    expect(body.audiences).toContain("all_users");
    expect(body.counts.gig_applicants).toBe(2);
    expect(body.counts.all_users).toBe(2); // sender excluded
    expect(body.max_recipients).toBeGreaterThan(0);
  });
});
