import { describe, it, expect, vi } from "vitest";
import { isLikelyBot, recordGigView } from "./view-count";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

describe("isLikelyBot", () => {
  it("lets browsers and agent HTTP clients through", () => {
    expect(isLikelyBot(BROWSER)).toBe(false);
    expect(isLikelyBot("curl/8.5.0")).toBe(false);
    expect(isLikelyBot("python-requests/2.32.3")).toBe(false);
  });

  it("drops crawlers, unfurlers and empty user agents", () => {
    expect(isLikelyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBot("facebookexternalhit/1.1")).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (compatible; AhrefsBot/7.0)")).toBe(true);
    expect(isLikelyBot("")).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
  });
});

describe("recordGigView", () => {
  it("counts through the increment_gig_views RPC, not a direct update", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn();
    const ok = await recordGigView({ rpc, from } as any, "g1", BROWSER);
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("increment_gig_views", { gig_id: "g1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not count bots", async () => {
    const rpc = vi.fn();
    expect(await recordGigView({ rpc } as any, "g1", "Googlebot/2.1")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await recordGigView({ rpc } as any, "g1", BROWSER)).toBe(false);
    rpc.mockResolvedValue({ error: { message: "nope" } });
    expect(await recordGigView({ rpc } as any, "g1", BROWSER)).toBe(false);
    spy.mockRestore();
  });
});
