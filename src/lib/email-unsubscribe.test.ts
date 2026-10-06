import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("@profullstack/stack/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@profullstack/stack/email")>();
  return {
    ...actual,
    createEmailer: vi.fn(() => ({ send: sendMock })),
  };
});

import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
} from "./email-unsubscribe";
import {
  sendEmail,
  withUnsubscribe,
  applicationDigestEmail,
  applicationStatusEmail,
  newApplicationEmail,
} from "./email";

const USER = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "test-unsubscribe-secret");
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("APP_URL", "https://ugig.net");
  sendMock.mockReset();
  sendMock.mockResolvedValue({ sent: true, id: "msg-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("unsubscribe tokens", () => {
  it("round-trips the user and setting", () => {
    const token = createUnsubscribeToken(USER, "email_application_status")!;
    expect(verifyUnsubscribeToken(token)).toEqual({
      userId: USER,
      setting: "email_application_status",
    });
  });

  it("rejects a token whose payload was changed", () => {
    const token = createUnsubscribeToken(USER, "email_new_message")!;
    const [, sig] = token.split(".");
    const forged = Buffer.from(`${USER}:email_new_application`).toString("base64url");
    expect(verifyUnsubscribeToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = createUnsubscribeToken(USER, "email_new_message")!;
    vi.stubEnv("UNSUBSCRIBE_SECRET", "rotated");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("rejects garbage, empty and unknown-setting tokens", () => {
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("abc")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
  });

  it("falls back to CRON_SECRET when UNSUBSCRIBE_SECRET is unset", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const token = createUnsubscribeToken(USER, "email_new_follower")!;
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token)?.setting).toBe("email_new_follower");
  });

  it("produces no token or link without any secret", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(createUnsubscribeToken(USER, "email_new_follower")).toBeNull();
    expect(unsubscribeUrl("https://ugig.net", USER, "email_new_follower")).toBeNull();
  });

  it("builds the unsubscribe URL on the API route", () => {
    const url = unsubscribeUrl("https://ugig.net", USER, "email_mention")!;
    expect(url.startsWith("https://ugig.net/api/email/unsubscribe?token=")).toBe(true);
    const token = decodeURIComponent(new URL(url).searchParams.get("token")!);
    expect(verifyUnsubscribeToken(token)?.setting).toBe("email_mention");
  });
});

describe("withUnsubscribe", () => {
  it("adds a footer link, a text line and RFC 8058 headers", () => {
    const out = withUnsubscribe(
      { html: "<html><body><p>hi</p></body></html>", text: "hi\n" },
      { userId: USER, setting: "email_new_application" }
    );
    expect(out.html).toContain("Unsubscribe from new application emails");
    expect(out.html).toContain("/api/email/unsubscribe?token=");
    expect(out.html.indexOf("Unsubscribe")).toBeLessThan(out.html.indexOf("</body>"));
    expect(out.text).toContain("Unsubscribe from new application emails: https://ugig.net/api/email/unsubscribe?token=");
    expect(out.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/ugig\.net\/api\/email\/unsubscribe\?token=.+>$/);
    expect(out.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("leaves content unchanged when no secret is configured", () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    const content = { html: "<html><body>x</body></html>", text: "x" };
    expect(withUnsubscribe(content, { userId: USER, setting: "email_mention" })).toEqual(content);
  });
});

describe("sendEmail with unsubscribe", () => {
  it("passes the List-Unsubscribe headers to the emailer", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await sendEmail({
      to: "someone@example.test",
      subject: "s",
      html: "<html><body>x</body></html>",
      text: "x",
      unsubscribe: { userId: USER, setting: "email_application_status" },
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.headers["List-Unsubscribe"]).toContain("/api/email/unsubscribe?token=");
    expect(sent.html).toContain("Unsubscribe from application status emails");
  });

  it("sends no unsubscribe headers for transactional email", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await sendEmail({ to: "someone@example.test", subject: "s", html: "<p>x</p>" });
    expect(sendMock.mock.calls[0][0].headers).toBeUndefined();
  });
});

describe("application email templates", () => {
  it("escapes user-controlled text in the status email", () => {
    const out = applicationStatusEmail({
      applicantName: "<b>A</b>",
      gigTitle: "<script>x</script>",
      gigId: "gig-1",
      status: "rejected",
      posterName: "P&Q",
    });
    expect(out.html).not.toContain("<script>x</script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("P&amp;Q");
  });

  it("escapes the cover letter in the new application email", () => {
    const out = newApplicationEmail({
      posterName: "P",
      applicantName: "A",
      gigTitle: "G",
      gigId: "gig-1",
      applicationId: "app-1",
      coverLetterPreview: '<img src=x onerror="alert(1)">',
    });
    expect(out.html).not.toContain("<img src=x");
  });

  it("summarises the digest across gigs and caps the listed applicants", () => {
    const out = applicationDigestEmail({
      posterName: "Pat",
      gigs: [
        {
          gigId: "gig-1",
          gigTitle: "Logo",
          applicants: Array.from({ length: 7 }, (_, i) => ({
            name: `Applicant ${i + 1}`,
            coverLetterPreview: "I can help",
          })),
        },
        { gigId: "gig-2", gigTitle: "<i>Site</i>", applicants: [{ name: "Solo", coverLetterPreview: "hi" }] },
      ],
    });
    expect(out.subject).toBe("8 new applications on 2 gigs - ugig.net");
    expect(out.html).toContain("Applicant 5");
    expect(out.html).not.toContain("Applicant 6");
    expect(out.html).toContain("and 2 more");
    expect(out.html).toContain("https://ugig.net/gigs/gig-1/applications");
    expect(out.html).toContain("&lt;i&gt;Site&lt;/i&gt;");
    expect(out.text).toContain("Logo (7)");
  });

  it("uses singular wording for one application", () => {
    const out = applicationDigestEmail({
      posterName: "Pat",
      gigs: [{ gigId: "g", gigTitle: "T", applicants: [{ name: "A", coverLetterPreview: "" }] }],
    });
    expect(out.subject).toBe("1 new application on 1 gig - ugig.net");
  });
});
