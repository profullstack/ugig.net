import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  coinpayFetch,
  resetCoinpayThrottle,
  CoinpayRateLimitError,
  isCoinpayRateLimitError,
} from "./coinpay-throttle";

/**
 * These tests are about one thing: a 429 from CoinPay must never end up
 * recorded as "this invoice cannot be paid". A rate limit clears on its own.
 */

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify({ ok: status < 400 }), {
    status,
    headers,
  });
}

describe("coinpayFetch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetCoinpayThrottle();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes a successful response straight through", async () => {
    fetchMock.mockResolvedValue(response(200));

    const res = await coinpayFetch("https://coinpayportal.com/api/payments/create");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and returns the eventual success", async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, { "retry-after": "0" }))
      .mockResolvedValueOnce(response(200));

    const res = await coinpayFetch("https://coinpayportal.com/api/payments/create");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx as well — a flaky provider is not a bad invoice", async () => {
    fetchMock.mockResolvedValueOnce(response(502)).mockResolvedValueOnce(response(200));

    const res = await coinpayFetch("https://coinpayportal.com/api/payments/create", undefined, {
      deadline: Date.now() + 10_000,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx that is the caller's fault", async () => {
    fetchMock.mockResolvedValue(response(400));

    const res = await coinpayFetch("https://coinpayportal.com/api/payments/create");

    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands back a response it cannot classify instead of replaying it", async () => {
    // A payment creation replayed on a guess mints a second live address for
    // one debt, so anything without a readable status is returned as-is.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await coinpayFetch("https://coinpayportal.com/api/payments/create");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives back the 429 rather than throwing when retries run out", async () => {
    fetchMock.mockResolvedValue(response(429, { "retry-after": "0" }));

    const res = await coinpayFetch("https://coinpayportal.com/api/payments/create", undefined, {
      deadline: Date.now() + 5_000,
    });

    expect(res.status).toBe(429);
    // Bounded, not infinite.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("stops waiting once the deadline has passed", async () => {
    // A 429 that says "come back in a minute" against an already-spent budget.
    fetchMock.mockResolvedValue(response(429, { "retry-after": "60" }));

    await coinpayFetch("https://coinpayportal.com/api/payments/create", undefined, {
      deadline: Date.now() + 100,
    });

    // The first call goes out; waiting 60s past a 100ms deadline does not.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A caller arriving now inherits the provider-stated block and, with no
    // time budget left, fails fast instead of sitting on the request.
    await expect(
      coinpayFetch("https://coinpayportal.com/api/payments/create", undefined, {
        deadline: Date.now() + 50,
      })
    ).rejects.toBeInstanceOf(CoinpayRateLimitError);
  });

  it("paces concurrent callers instead of firing them all at once", async () => {
    // One slot per minute makes the pacing observable without waiting for it.
    vi.stubEnv("COINPAY_MAX_REQUESTS_PER_MINUTE", "1");
    vi.resetModules();
    const throttle = await import("./coinpay-throttle");
    throttle.resetCoinpayThrottle();

    fetchMock.mockResolvedValue(response(200));

    const first = throttle.coinpayFetch("https://coinpayportal.com/api/payments/create");
    const second = throttle.coinpayFetch(
      "https://coinpayportal.com/api/payments/create",
      undefined,
      {
        deadline: Date.now() + 200,
      }
    );

    await expect(first).resolves.toMatchObject({ status: 200 });
    // The second has to wait out the window, which outlasts its budget.
    await expect(second).rejects.toBeInstanceOf(throttle.CoinpayRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllEnvs();
  });

  it("retries a dropped connection, then rethrows if it keeps dropping", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      coinpayFetch("https://coinpayportal.com/api/payments/create", undefined, {
        deadline: Date.now() + 3_000,
      })
    ).rejects.toThrow("ECONNRESET");

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("isCoinpayRateLimitError", () => {
  it("distinguishes a rate limit from a provider rejection", () => {
    expect(isCoinpayRateLimitError(new CoinpayRateLimitError())).toBe(true);
    expect(isCoinpayRateLimitError(new Error("bad currency"))).toBe(false);
    expect(isCoinpayRateLimitError(null)).toBe(false);
  });
});
