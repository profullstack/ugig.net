import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function req(url = "https://preview.ugig.example/api/auth/coinpay") {
  return new NextRequest(url);
}

describe("GET /api/auth/coinpay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the Vercel deployment URL for OAuth redirects when app url is not configured", async () => {
    vi.stubEnv("COINPAY_OAUTH_CLIENT_ID", "coinpay-client");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "preview-ugig.vercel.app");

    const res = await GET(req());
    const location = res.headers.get("location");

    expect(location).toContain("https://coinpayportal.com/api/oauth/authorize?");
    expect(location).toContain("client_id=coinpay-client");
    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("https://preview-ugig.vercel.app/api/callback/oauth")}`
    );
  });

  it("falls back to the local request origin for local development", async () => {
    vi.stubEnv("COINPAY_OAUTH_CLIENT_ID", "coinpay-client");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");

    const res = await GET(req("http://localhost:8080/api/auth/coinpay"));
    const location = res.headers.get("location");

    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("http://localhost:8080/api/callback/oauth")}`
    );
  });

  it("normalizes a configured app url before building the OAuth redirect", async () => {
    vi.stubEnv("COINPAY_OAUTH_CLIENT_ID", "coinpay-client");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.ugig.example/");

    const res = await GET(req());
    const location = res.headers.get("location");

    expect(location).toContain(
      `redirect_uri=${encodeURIComponent("https://staging.ugig.example/api/callback/oauth")}`
    );
  });
});
