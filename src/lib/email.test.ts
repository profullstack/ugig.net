import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  gigExpiredEmail,
  passwordResetEmail,
  referralInviteEmail,
  signupConfirmationEmail,
  videoCallInviteEmail,
} from "./email";

describe("videoCallInviteEmail", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://ugig.net");
  });

  it("generates correct subject line", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
    });

    expect(result.subject).toBe("Bob invited you to a video call");
  });

  it("includes join link in HTML", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
    });

    expect(result.html).toContain("https://ugig.net/dashboard/calls/call-123");
    expect(result.html).toContain("Join Video Call");
  });

  it("includes join link in text", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
    });

    expect(result.text).toContain("https://ugig.net/dashboard/calls/call-123");
  });

  it("includes participant and initiator names", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
    });

    expect(result.html).toContain("Hi Alice");
    expect(result.html).toContain("<strong>Bob</strong>");
    expect(result.text).toContain("Hi Alice");
    expect(result.text).toContain("Bob");
  });

  it("includes gig title when provided", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
      gigTitle: "Build a Landing Page",
    });

    expect(result.html).toContain("Build a Landing Page");
    expect(result.text).toContain("Build a Landing Page");
  });

  it("excludes gig context when no gig title", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
      gigTitle: null,
    });

    expect(result.html).not.toContain("Regarding:");
    expect(result.text).not.toContain("Regarding:");
  });

  it("shows scheduled time when provided", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
      scheduledAt: "2025-01-15T14:00:00Z",
    });

    expect(result.html).toContain("Video Call Scheduled");
    expect(result.html).toContain("Scheduled for:");
    expect(result.text).toContain("Video Call Scheduled");
  });

  it("shows invitation title when not scheduled", () => {
    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
    });

    expect(result.html).toContain("Video Call Invitation");
    expect(result.text).toContain("Video Call Invitation");
  });

  it("uses default base URL when env not set", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    const result = videoCallInviteEmail({
      participantName: "Alice",
      initiatorName: "Bob",
      callId: "call-123",
    });

    expect(result.html).toContain("https://ugig.net/dashboard/calls/call-123");
  });
});

describe("referralInviteEmail", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://ugig.net");
  });

  it("generates a signup invite with the referral code", () => {
    const result = referralInviteEmail({
      inviterName: "Codex Earner",
      referralCode: "codex/ref code",
    });

    expect(result.subject).toBe("Codex Earner invited you to join ugig.net");
    expect(result.html).toContain("https://ugig.net/signup?ref=codex%2Fref%20code");
    expect(result.text).toContain("https://ugig.net/signup?ref=codex%2Fref%20code");
    expect(result.html).toContain("Accept Invite");
  });

  it("escapes inviter names in HTML while preserving readable text", () => {
    const result = referralInviteEmail({
      inviterName: `Alice <b>Builder</b> & "Co"`,
      referralCode: "safe-code",
    });

    expect(result.html).toContain("Alice &lt;b&gt;Builder&lt;/b&gt; &amp; &quot;Co&quot;");
    expect(result.html).not.toContain("Alice <b>Builder</b>");
    expect(result.text).toContain(`Alice <b>Builder</b> & "Co" invited you`);
    expect(result.subject).toBe(`Alice <b>Builder</b> & "Co" invited you to join ugig.net`);
  });
});

describe("signupConfirmationEmail", () => {
  it("generates a confirmation email with the supplied link", () => {
    const result = signupConfirmationEmail({
      name: "New User",
      confirmUrl: "https://ugig.net/auth/confirm?token_hash=abc&type=signup",
    });

    expect(result.subject).toBe("Confirm your ugig.net account");
    expect(result.html).toContain("Confirm Email");
    expect(result.html).toContain("https://ugig.net/auth/confirm?token_hash=abc&amp;type=signup");
    expect(result.text).toContain("https://ugig.net/auth/confirm?token_hash=abc&type=signup");
  });
});

describe("passwordResetEmail", () => {
  it("generates a password reset email with the supplied link", () => {
    const result = passwordResetEmail({
      resetUrl: "https://ugig.net/auth/confirm?token_hash=abc&type=recovery&next=%2Freset-password",
    });

    expect(result.subject).toBe("Reset your ugig.net password");
    expect(result.html).toContain("Reset Password");
    expect(result.html).toContain(
      "https://ugig.net/auth/confirm?token_hash=abc&amp;type=recovery&amp;next=%2Freset-password"
    );
    expect(result.text).toContain(
      "https://ugig.net/auth/confirm?token_hash=abc&type=recovery&next=%2Freset-password"
    );
  });
});

describe("gigExpiredEmail", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://ugig.net");
  });

  it("links to the gig page's renew button with the renew window", () => {
    const r = gigExpiredEmail({ posterName: "Pat", gigTitle: "Build a CLI", gigId: "g1", applicantCount: 2, renewDays: 60 });
    expect(r.subject).toContain("Build a CLI");
    expect(r.html).toContain("/gigs/g1#renew");
    expect(r.html).toContain("Renew for 60 days");
    expect(r.text).toContain("/gigs/g1#renew");
    expect(r.html).not.toContain("/gig/g1");
    expect(r.text).toContain("2 applications");
  });

  it("defaults to 30 days and handles zero applications", () => {
    const r = gigExpiredEmail({ posterName: "Pat", gigTitle: "T", gigId: "g1", applicantCount: 0 });
    expect(r.text).toContain("another 30 days");
    expect(r.text).toContain("didn't receive any applications");
  });

  it("escapes the poster name and gig title in the HTML", () => {
    const r = gigExpiredEmail({ posterName: "<b>x</b>", gigTitle: "<script>1</script>", gigId: "g1", applicantCount: 1 });
    expect(r.html).not.toContain("<script>1</script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
