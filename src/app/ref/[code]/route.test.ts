import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function makeParams(code: string) {
  return { params: Promise.resolve({ code }) };
}

describe("GET /ref/[code]", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to the current request origin when no app URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    const res = await GET(
      new NextRequest("http://localhost:3000/ref/alice code/1"),
      makeParams("alice code/1")
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/api/affiliates/click?ugig_ref=alice+code%2F1"
    );
  });

  it("redirects to the configured public app URL when present", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.ugig.example");

    const res = await GET(
      new NextRequest("http://localhost:3000/ref/alice"),
      makeParams("alice")
    );

    expect(res.headers.get("location")).toBe(
      "https://staging.ugig.example/api/affiliates/click?ugig_ref=alice"
    );
  });
});
