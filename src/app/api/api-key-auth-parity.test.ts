/**
 * API-key callers (CLI, agents) must reach the same per-user routes as a
 * browser session. These routes used to call supabase.auth.getUser() only, so
 * an `x-api-key` caller got 401. Each now resolves the caller through
 * getAuthContext(), which accepts a session, a Bearer JWT, AgentPass or a
 * full-access API key.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const USER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";

/** A PostgREST-ish builder: every method chains; awaiting yields `result`. */
function builder(result: { data?: unknown; error?: unknown } = {}) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "update", "insert", "upsert"]) {
    b[m] = vi.fn(() => b);
  }
  b.single = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  b.maybeSingle = b.single;
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(resolve, reject);
  return b;
}

const tables: Record<string, ReturnType<typeof builder>> = {};
const serviceClient = {
  from: vi.fn((table: string) => tables[table] ?? builder()),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://files.example/x" } })),
    })),
  },
  auth: {
    admin: {
      getUserById: vi.fn(async () => ({ data: { user: { id: USER_ID, email: "a@example.com" } } })),
    },
  },
};

// No browser session anywhere: the only credential is the API key.
const anonClient = {
  from: vi.fn((table: string) => tables[table] ?? builder()),
  auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
};

const getAuthContext = vi.fn();

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => getAuthContext(...args),
  createServiceClient: () => serviceClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => anonClient),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => serviceClient,
  authenticateWithToken: vi.fn(async () => null),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ id: "cs_1", url: "https://stripe/x" })) } },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://stripe/portal" })) } },
  },
  PLANS: { pro: { priceId: "price_1" } },
}));

vi.mock("@/lib/coinpay-client", () => ({
  SUPPORTED_CURRENCIES: { sol: {}, card: {} },
  createCoinpayPayment: vi.fn(async (args: unknown) => {
    lastFundingPayment = args;
    return { payment_id: "cp-1", address: "addr", currency: "sol" };
  }),
}));
let lastFundingPayment: any = null;

vi.mock("@/lib/resume-parser", () => ({
  parseResumeFile: vi.fn(async () => ({ full_name: "Ada", work_history: [] })),
}));
vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn(async () => null),
  onResumeUploaded: vi.fn(),
}));

function apiKeyAuth() {
  getAuthContext.mockResolvedValue({
    user: { id: USER_ID, authMethod: "api_key", scope: "full" },
    supabase: serviceClient,
  });
}

function req(url: string, init: { method?: string; body?: any; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: { "x-api-key": "ugig_live_test", ...(init.headers ?? {}) },
    body: init.body,
  });
}

/** Multipart requests as the route sees them (jsdom cannot build one). */
function formReq(form: FormData) {
  return { method: "POST", headers: new Headers({ "x-api-key": "k" }), formData: async () => form } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  getAuthContext.mockResolvedValue(null);
});

describe("API-key access to per-user routes", () => {
  it("GET /api/api-keys lists the key owner's keys", async () => {
    apiKeyAuth();
    tables.api_keys = builder({ data: [{ id: "k1" }] });
    const { GET } = await import("./api-keys/route");
    const res = await GET(req("/api/api-keys"));
    expect(res.status).toBe(200);
    expect((await res.json()).keys).toEqual([{ id: "k1" }]);
    expect(tables.api_keys.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("GET /api/api-keys is still 401 with no credential", async () => {
    const { GET } = await import("./api-keys/route");
    const res = await GET(req("/api/api-keys"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/api-keys/:id revokes only the caller's key", async () => {
    apiKeyAuth();
    tables.api_keys = builder({ data: { id: "k1" } });
    const { DELETE } = await import("./api-keys/[id]/route");
    const res = await DELETE(req("/api/api-keys/k1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(200);
    expect(tables.api_keys.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("GET /api/auth/session reports the key owner", async () => {
    apiKeyAuth();
    tables.profiles = builder({ data: { id: USER_ID, username: "ada" } });
    const { GET } = await import("./auth/session/route");
    const res = await GET(req("/api/auth/session"));
    const json = await res.json();
    expect(json.user).toMatchObject({ id: USER_ID, auth_method: "api_key" });
    expect(json.profile).toMatchObject({ username: "ada" });
  });

  it("GET /api/auth/session is still null/null with no credential", async () => {
    const { GET } = await import("./auth/session/route");
    const json = await (await GET(req("/api/auth/session"))).json();
    expect(json).toEqual({ user: null, profile: null });
  });

  it("GET /api/funding/history works for an API key", async () => {
    apiKeyAuth();
    const { GET } = await import("./funding/history/route");
    const res = await GET(req("/api/funding/history"));
    expect(res.status).toBe(200);
  });

  it("POST /api/funding/create-invoice attributes the payment to the key owner", async () => {
    apiKeyAuth();
    const { POST } = await import("./funding/create-invoice/route");
    const res = await POST(
      req("/api/funding/create-invoice", {
        method: "POST",
        body: JSON.stringify({ amount_usd: 5, currency: "sol" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBeLessThan(400);
    expect(lastFundingPayment.metadata.user_id).toBe(USER_ID);
    // The key context has no email; the route reads it from the auth user.
    expect(lastFundingPayment.metadata.contributor_email).toBe("a@example.com");
  });

  it("POST /api/subscriptions/portal works for an API key", async () => {
    apiKeyAuth();
    tables.subscriptions = builder({ data: { stripe_customer_id: "cus_1" } });
    const { POST } = await import("./subscriptions/portal/route");
    const res = await POST(req("/api/subscriptions/portal", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("POST /api/subscriptions/checkout works for an API key", async () => {
    apiKeyAuth();
    tables.subscriptions = builder({ data: null });
    tables.profiles = builder({ data: { username: "ada" } });
    const { POST } = await import("./subscriptions/checkout/route");
    const res = await POST(req("/api/subscriptions/checkout", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(serviceClient.auth.admin.getUserById).toHaveBeenCalledWith(USER_ID);
  });

  it("POST /api/attachments/upload works for an API key participant", async () => {
    apiKeyAuth();
    tables.conversations = builder({ data: { participant_ids: [USER_ID] } });
    const form = new FormData();
    form.append("file", new File(["hi"], "a.txt", { type: "text/plain" }));
    form.append("conversationId", "c1");
    const { POST } = await import("./attachments/upload/route");
    const res = await POST(formReq(form));
    expect(res.status).toBe(200);
  });

  it("POST /api/attachments/upload still forbids a non-participant key", async () => {
    apiKeyAuth();
    tables.conversations = builder({ data: { participant_ids: ["someone-else"] } });
    const form = new FormData();
    form.append("file", new File(["hi"], "a.txt", { type: "text/plain" }));
    form.append("conversationId", "c1");
    const { POST } = await import("./attachments/upload/route");
    const res = await POST(formReq(form));
    expect(res.status).toBe(403);
  });

  it("POST /api/profile/import works for an API key", async () => {
    apiKeyAuth();
    tables.profiles = builder({ data: null });
    // jsdom's File has no arrayBuffer(); the route only needs these fields.
    const file = {
      name: "cv.pdf",
      type: "application/pdf",
      size: 8,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    const form = { get: (k: string) => (k === "file" ? file : null) } as unknown as FormData;
    const { POST } = await import("./profile/import/route");
    const res = await POST(formReq(form));
    expect(res.status).toBe(200);
    expect(tables.profiles.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("GET /api/users/:username/endorsements marks the key owner's endorsements", async () => {
    apiKeyAuth();
    tables.profiles = builder({ data: { id: "other", skills: [] } });
    tables.endorsements = builder({
      data: [
        {
          skill: "go",
          endorser_id: USER_ID,
          comment: null,
          created_at: "2026-01-01",
          endorser: { id: USER_ID, username: "ada", full_name: null, avatar_url: null },
        },
      ],
    });
    const { GET } = await import("./users/[username]/endorsements/route");
    const res = await GET(req("/api/users/bob/endorsements"), {
      params: Promise.resolve({ username: "bob" }),
    });
    const json = await res.json();
    expect(json.data[0].endorsed_by_current_user).toBe(true);
  });
});
