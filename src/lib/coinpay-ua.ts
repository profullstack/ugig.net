import pkg from "../../package.json";

/**
 * User-Agent for server-side calls to CoinPay. Every fleet app shares one
 * public IP on dev2, so CoinPay's logs and throttle tell the apps apart by
 * this header instead of a bare `node` agent.
 */
export const COINPAY_UA = `ugig.net/${pkg.version} (+https://ugig.net)`;

/**
 * `init` with COINPAY_UA added unless a User-Agent is already set. Plain-object
 * headers stay plain objects (callers and tests read them by key).
 */
export function withCoinpayUa(init: RequestInit = {}): RequestInit {
  const h = init.headers;
  if (h instanceof Headers) {
    const headers = new Headers(h);
    if (!headers.has("user-agent")) headers.set("user-agent", COINPAY_UA);
    return { ...init, headers };
  }
  if (Array.isArray(h)) {
    if (h.some(([k]) => k.toLowerCase() === "user-agent")) return init;
    return { ...init, headers: [...h, ["user-agent", COINPAY_UA]] };
  }
  const obj = (h ?? {}) as Record<string, string>;
  if (Object.keys(obj).some((k) => k.toLowerCase() === "user-agent")) return init;
  return { ...init, headers: { ...obj, "user-agent": COINPAY_UA } };
}
