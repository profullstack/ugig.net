import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

import { GET } from "./route";

function makeRequest(query = "") {
  return { url: `http://localhost/api/zaps/history${query}` } as any;
}

function makeAdmin(
  zaps: any[] | null = [{ id: "zap-1", sender_id: "sender-1", recipient_id: "user-1" }],
  count = zaps?.length ?? 0
) {
  const range = vi.fn().mockResolvedValue({
    data: zaps,
    count,
  });
  const order = vi.fn().mockReturnValue({ range });
  const eq = vi.fn().mockReturnValue({ order });
  const selectZaps = vi.fn().mockReturnValue({ eq });

  const inProfiles = vi.fn().mockResolvedValue({
    data: [
      {
        id: "sender-1",
        username: "sender",
        full_name: "Sender User",
        avatar_url: "https://example.com/avatar.png",
      },
    ],
  });
  const selectProfiles = vi.fn().mockReturnValue({ in: inProfiles });

  const from = vi.fn((table: string) => {
    if (table === "profiles") return { select: selectProfiles };
    return { select: selectZaps };
  });

  return { admin: { from }, range, inProfiles, from };
}

describe("GET /api/zaps/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("clamps invalid pagination values before querying", async () => {
    const { admin, range } = makeAdmin();
    mockCreateServiceClient.mockReturnValue(admin);
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET(makeRequest("?limit=0&offset=-5"));

    expect(res.status).toBe(200);
    expect(range).toHaveBeenCalledWith(0, 49);
  });

  it("caps large limits at 100", async () => {
    const { admin, range } = makeAdmin();
    mockCreateServiceClient.mockReturnValue(admin);
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET(makeRequest("?limit=500&offset=10"));

    expect(res.status).toBe(200);
    expect(range).toHaveBeenCalledWith(10, 109);
  });

  it("uses valid pagination values as provided", async () => {
    const { admin, range } = makeAdmin();
    mockCreateServiceClient.mockReturnValue(admin);
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET(makeRequest("?limit=12&offset=24"));

    expect(res.status).toBe(200);
    expect(range).toHaveBeenCalledWith(24, 35);
  });

  it("does not query profiles when there are no zaps", async () => {
    const { admin, inProfiles } = makeAdmin([], 3);
    mockCreateServiceClient.mockReturnValue(admin);
    mockGetAuthContext.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ zaps: [], total: 3 });
    expect(inProfiles).not.toHaveBeenCalled();
  });
});
