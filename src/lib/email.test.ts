import { describe, it, expect, vi, beforeEach } from "vitest";
import { videoCallInviteEmail } from "./email";

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
