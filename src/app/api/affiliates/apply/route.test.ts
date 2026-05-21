import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function makeRequest(body: unknown, headers: HeadersInit = {}) {
  return new NextRequest("http://localhost/api/affiliates/apply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "session=abc",
      authorization: "Bearer token",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/affiliates/apply", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects malformed request bodies before proxying", async () => {
    const res = await POST(makeRequest("{bad-json"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "offer_id must be a non-empty string",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-string offer ids before proxying", async () => {
    for (const offer_id of [123, ["offer-1"], { id: "offer-1" }, true, "   "]) {
      vi.mocked(fetch).mockClear();

      const res = await POST(makeRequest({ offer_id }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "offer_id must be a non-empty string",
      });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it("trims and forwards valid string offer ids with auth headers", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));

    const res = await POST(
      makeRequest({
        offer_id: " offer/with spaces ",
        note: "joining",
      })
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost/api/affiliates/offers/offer%2Fwith%20spaces/apply",
      {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          cookie: "session=abc",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          offer_id: "offer/with spaces",
          note: "joining",
        }),
      }
    );
  });
});
