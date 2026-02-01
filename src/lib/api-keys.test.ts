import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey, getKeyPrefix } from "./api-keys";

describe("api-keys", () => {
  describe("generateApiKey", () => {
    it("generates a key with ugig_live_ prefix", () => {
      const key = generateApiKey();
      expect(key).toMatch(/^ugig_live_/);
    });

    it("generates unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it("generates a key of consistent length", () => {
      const key = generateApiKey();
      // ugig_live_ (10 chars) + 32 chars of base64url = 42 chars
      expect(key.length).toBe(42);
    });
  });

  describe("hashApiKey / verifyApiKey", () => {
    it("hashes and verifies a key correctly", async () => {
      const key = generateApiKey();
      const hash = await hashApiKey(key);

      expect(hash).not.toBe(key);
      expect(await verifyApiKey(key, hash)).toBe(true);
    });

    it("rejects an incorrect key", async () => {
      const key = generateApiKey();
      const hash = await hashApiKey(key);
      const wrongKey = generateApiKey();

      expect(await verifyApiKey(wrongKey, hash)).toBe(false);
    });

    it("produces different hashes for the same key (bcrypt salt)", async () => {
      const key = generateApiKey();
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);

      expect(hash1).not.toBe(hash2);
      // Both should still verify
      expect(await verifyApiKey(key, hash1)).toBe(true);
      expect(await verifyApiKey(key, hash2)).toBe(true);
    });
  });

  describe("getKeyPrefix", () => {
    it("returns the first 16 characters", () => {
      const key = "ugig_live_abcdef123456789xyz";
      expect(getKeyPrefix(key)).toBe("ugig_live_abcdef");
    });

    it("returns the full string if shorter than 16 chars", () => {
      const key = "short";
      expect(getKeyPrefix(key)).toBe("short");
    });
  });
});
