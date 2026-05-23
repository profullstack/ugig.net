import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function req(path = "/api/callback/oauth") {
  return new NextRequest(`https://preview.ugig.example${path}`);
}

describe("GET /api/callback/oauth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects OAuth errors to the Vercel deployment URL when app url is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "preview-ugig.vercel.app");

    const res = await GET(req("/api/callback/oauth?error=access_denied"));

    expect(res.headers.get("location")).toBe(
      "https://preview-ugig.vercel.app/login?error=coinpay_denied"
    );
  });

  it("does not redirect OAuth errors to an untrusted request host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");

    const res = await GET(req("/api/callback/oauth?error=access_denied"));

    expect(res.headers.get("location")).toBe("https://ugig.net/login?error=coinpay_denied");
  });

  it("normalizes a configured app url for OAuth error redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.ugig.example/");

    const res = await GET(req("/api/callback/oauth?error=access_denied"));

    expect(res.headers.get("location")).toBe(
      "https://staging.ugig.example/login?error=coinpay_denied"
    );
  });
});
