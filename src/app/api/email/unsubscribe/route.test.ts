import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

vi.mock("@/lib/auth/get-user", () => ({
  createServiceClient: vi.fn(() => ({ from })),
}));

import { GET, POST } from "./route";
import { createUnsubscribeToken } from "@/lib/email-unsubscribe";

const USER = "11111111-2222-4333-8444-555555555555";

function req(method: "GET" | "POST", token: string | null) {
  const url = new URL("http://localhost/api/email/unsubscribe");
  if (token !== null) url.searchParams.set("token", token);
  return new NextRequest(url, {
    method,
    ...(method === "POST"
      ? {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
        }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("UNSUBSCRIBE_SECRET", "unsub-test-secret");
  upsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/email/unsubscribe", () => {
  it("GET turns the named setting off and shows a confirmation page", async () => {
    const token = createUnsubscribeToken(USER, "email_application_status")!;
    const res = await GET(req("GET", token));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("You're unsubscribed");
    expect(html).toContain("application status emails");
    expect(from).toHaveBeenCalledWith("notification_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, email_application_status: false }),
      { onConflict: "user_id" }
    );
    // Only that one setting is touched.
    const row = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(row).filter((k) => k.startsWith("email_"))).toEqual(["email_application_status"]);
  });

  it("POST (RFC 8058 one-click) does the same", async () => {
    const token = createUnsubscribeToken(USER, "email_new_application")!;
    const res = await POST(req("POST", token));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, email_new_application: false }),
      { onConflict: "user_id" }
    );
  });

  it("rejects a tampered token without writing", async () => {
    const token = createUnsubscribeToken(USER, "email_new_message")!;
    const res = await GET(req("GET", token.slice(0, -2) + "xx"));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing token without writing", async () => {
    const res = await GET(req("GET", null));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("answers 500 when the settings write fails", async () => {
    upsert.mockResolvedValue({ error: { message: "db down" } });
    const token = createUnsubscribeToken(USER, "email_mention")!;
    const res = await GET(req("GET", token));
    expect(res.status).toBe(500);
  });
});
