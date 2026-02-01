import { describe, it, expect } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("rate-limit", () => {
  describe("checkRateLimit", () => {
    it("allows the first request", () => {
      const result = checkRateLimit("test-user-1", "read");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99); // 100 - 1
      expect(result.limit).toBe(100);
    });

    it("tracks multiple requests", () => {
      const id = "test-user-track-" + Date.now();
      checkRateLimit(id, "auth");
      checkRateLimit(id, "auth");
      const result = checkRateLimit(id, "auth");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 10 - 3
    });

    it("blocks after exceeding the limit", () => {
      const id = "test-user-block-" + Date.now();

      // Use auth limit (10 per minute)
      for (let i = 0; i < 10; i++) {
        const r = checkRateLimit(id, "auth");
        expect(r.allowed).toBe(true);
      }

      // 11th request should be blocked
      const result = checkRateLimit(id, "auth");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("uses separate limits for different categories", () => {
      const id = "test-user-categories-" + Date.now();

      // Exhaust auth limit
      for (let i = 0; i < 10; i++) {
        checkRateLimit(id, "auth");
      }
      expect(checkRateLimit(id, "auth").allowed).toBe(false);

      // Read should still be allowed
      expect(checkRateLimit(id, "read").allowed).toBe(true);
    });

    it("uses separate limits for different identifiers", () => {
      const id1 = "test-user-sep-a-" + Date.now();
      const id2 = "test-user-sep-b-" + Date.now();

      // Exhaust limit for id1
      for (let i = 0; i < 10; i++) {
        checkRateLimit(id1, "auth");
      }
      expect(checkRateLimit(id1, "auth").allowed).toBe(false);

      // id2 should still be allowed
      expect(checkRateLimit(id2, "auth").allowed).toBe(true);
    });

    it("returns a resetAt timestamp in the future", () => {
      const id = "test-user-reset-" + Date.now();
      const result = checkRateLimit(id, "write");
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });
  });
});
