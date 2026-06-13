import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/get-user";
import { POST } from "./route";

function postReq(json: () => Promise<unknown>) {
  return {
    url: "http://localhost/api/work-history",
    headers: new Headers(),
    json,
  } as any;
}

describe("POST /api/work-history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for malformed JSON before inserting work history", async () => {
    const from = vi.fn();
    (getAuthContext as any).mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      supabase: { from },
    });

    const res = await POST(postReq(() => Promise.reject(new SyntaxError("bad json"))));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
    expect(from).not.toHaveBeenCalled();
  });
});
