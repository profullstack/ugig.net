import { describe, it, expect } from "vitest";
import { POST } from "./route";

describe("POST /api/subscriptions/checkout (retired card checkout)", () => {
  it("returns 410 and points at the CoinPay checkout", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.checkout.url).toBe("/api/payments/coinpayportal/create");
    expect(body.error).toMatch(/\$9\/month/);
    expect(body.error).toMatch(/\$90\/year/);
    expect(body.error).toMatch(/\$100 one-time/);
  });
});
