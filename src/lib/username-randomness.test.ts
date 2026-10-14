import { describe, it, expect } from "vitest";
import { looksRandomUsername, nameLikeness, RANDOM_USERNAME_MESSAGE } from "./username-randomness";
import { signupSchema } from "./validations";

// The five from the 2026-10-14 daily report, plus more of the same wave.
const BOT_WAVE = [
  "ljokjvnp", "rhtpwovo", "bijxqdwi", "kdrmtwwz", "fbpigbym",
  "lcxrxqnk", "qpqzkmfc", "uomjyvmh", "dxyjdvbb", "wzpvsvxu", "kuujbpnf",
  "kkhrhzzg", "qxhgixzd", "npgyydxv", "vbwijprx", "ncvknewc", "ztrrryqz",
  "gcpzoxav", "nyohiwlq", "ehsowqqy", "iqrtugdv", "jofvkdws", "zdxektpi",
];

// Real handles of established ugig accounts (gigs, accepted work, paid
// invoices, posts), chosen from the ones the model scores lowest: pinyin,
// Korean, initials, and names that are not English words.
const ESTABLISHED = [
  "chovy", "kimtaehyung", "xiaozhua", "ncniuniu", "lunahikaru", "brunogalvao",
  "gabearnvdox", "diyaluo", "tankgxy", "xtawiz", "alexcvr", "atlankx",
  "nixdrift", "KCDaemon", "SabFabDev", "TheRealRiotCoder", "lizhimngfi",
  "nyfere", "Kevlee", "kashvi", "fishbig", "nullref", "mayzon", "Paulkrau",
  "aelyra", "alvazar", "JohnDoee", "zaicode", "kouzitech", "xelaearn",
  "vudinhhungcloud", "axoncryptodev", "miprojt",
];

// Handles a person might reasonably pick, from many languages and from tech.
const PLAUSIBLE = [
  "johnsmith", "pixelsmith", "kwilliams", "dkowalski", "nguyenvan", "oluwaseun",
  "chukwuemeka", "srinivasan", "przemyslaw", "krzysztof", "szczepanski",
  "grzegorz", "brzezinski", "zhangwei", "takahashi", "ljungqvist", "nkosana",
  "mthunzi", "tchaikovsky", "schwarzenegger", "nietzsche", "abdulrahman",
  "goncalves", "rhythm", "pythonista", "rustacean", "tpkdev", "nextjs",
  "nuxtjs", "sveltekit", "kubernetes", "pkrsoftware", "smartfox", "xingkong",
];

describe("looksRandomUsername", () => {
  it.each(BOT_WAVE)("rejects the random handle %s", (u) => {
    expect(looksRandomUsername(u)).toBe(true);
  });

  it.each([...ESTABLISHED, ...PLAUSIBLE])("accepts the real handle %s", (u) => {
    expect(looksRandomUsername(u)).toBe(false);
  });

  it("never judges short handles, however odd", () => {
    for (const u of ["xqz", "mkbhd", "xqcow", "zzkq"]) expect(looksRandomUsername(u)).toBe(false);
  });

  it("leaves composed handles (digits, separators) to the other rules", () => {
    for (const u of ["kdrm-twwz", "kdrmtwwz7", "codexlab_mtq3lgkd", "ap_x7f2q9k1m4z8"]) {
      expect(looksRandomUsername(u)).toBe(false);
    }
  });

  it("does not let a dev/js/ai affix launder a random core", () => {
    expect(looksRandomUsername("kdrmtwwzdev")).toBe(true);
    expect(looksRandomUsername("aikdrmtwwz")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looksRandomUsername("KdrMTwwz")).toBe(true);
    expect(looksRandomUsername("JohnSmith")).toBe(false);
  });

  it("scores words above random letters by a wide margin", () => {
    expect(nameLikeness("pixelsmith")).toBeGreaterThan(0);
    expect(nameLikeness("kdrmtwwz")).toBeLessThan(-10);
  });

  it("drives the signup form and API validation", () => {
    const base = { email: "a@example.com", password: "Password1" };
    const bad = signupSchema.safeParse({ ...base, username: "kdrmtwwz" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toBe(RANDOM_USERNAME_MESSAGE);
    expect(signupSchema.safeParse({ ...base, username: "pixelsmith" }).success).toBe(true);
  });
});
