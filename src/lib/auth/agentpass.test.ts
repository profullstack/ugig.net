import { describe, it, expect } from "vitest";
import { parseAgentPassHeader, verifySignature } from "./agentpass";
import { createHmac } from "crypto";

describe("parseAgentPassHeader", () => {
  it("parses valid header", () => {
    const result = parseAgentPassHeader("AgentPass ap_abc123:sig456:1710000000000");
    expect(result).toEqual({
      passportId: "ap_abc123",
      signature: "sig456",
      timestamp: "1710000000000",
    });
  });

  it("is case-insensitive for scheme", () => {
    const result = parseAgentPassHeader("agentpass ap_abc123:sig456:1710000000000");
    expect(result).not.toBeNull();
  });

  it("returns null for Bearer header", () => {
    expect(parseAgentPassHeader("Bearer token123")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseAgentPassHeader(null)).toBeNull();
  });

  it("returns null for missing parts", () => {
    expect(parseAgentPassHeader("AgentPass ap_abc123:sig456")).toBeNull();
  });

  it("returns null for empty value", () => {
    expect(parseAgentPassHeader("AgentPass ")).toBeNull();
  });
});

describe("verifySignature", () => {
  const publicKey = "test-secret-key-123";
  const passportId = "ap_test123";
  const timestamp = "1710000000000";

  it("accepts valid HMAC signature", () => {
    const payload = `${passportId}:${timestamp}`;
    const signature = createHmac("sha256", publicKey).update(payload).digest("hex");

    expect(verifySignature(passportId, timestamp, signature, publicKey)).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(verifySignature(passportId, timestamp, "invalid-sig", publicKey)).toBe(false);
  });

  it("rejects wrong key", () => {
    const payload = `${passportId}:${timestamp}`;
    const signature = createHmac("sha256", "wrong-key").update(payload).digest("hex");

    expect(verifySignature(passportId, timestamp, signature, publicKey)).toBe(false);
  });

  it("rejects tampered timestamp", () => {
    const payload = `${passportId}:${timestamp}`;
    const signature = createHmac("sha256", publicKey).update(payload).digest("hex");

    expect(verifySignature(passportId, "9999999999999", signature, publicKey)).toBe(false);
  });
});
