import { afterEach, describe, expect, it } from "vitest";
import { isLightningWrite, lightningPaused } from "./paused";

afterEach(() => { delete process.env.LIGHTNING_PAUSED; });

describe("LIGHTNING_PAUSED", () => {
  it("is off unless set", () => {
    expect(lightningPaused()).toBe(false);
    process.env.LIGHTNING_PAUSED = "1";
    expect(lightningPaused()).toBe(true);
  });

  it("stops writes that move sats, never reads", () => {
    for (const p of ["/api/zaps", "/api/wallet/zap", "/api/wallet/deposit", "/api/wallet/deposit/check", "/api/wallet/withdraw"]) {
      expect(isLightningWrite("POST", p), p).toBe(true);
    }
    expect(isLightningWrite("GET", "/api/zaps")).toBe(false);
    expect(isLightningWrite("POST", "/api/zaps/stats")).toBe(false);
    expect(isLightningWrite("POST", "/api/wallet/balance")).toBe(false);
  });
});
