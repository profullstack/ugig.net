import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

function postReq(json: () => Promise<unknown>) {
  return {
    url: "http://localhost/api/testimonials",
    headers: new Headers(),
    json,
  } as any;
}

describe("POST /api/testimonials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for malformed JSON before creating a testimonial", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      supabase: {},
    });

    const res = await POST(postReq(() => Promise.reject(new SyntaxError("bad json"))));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
