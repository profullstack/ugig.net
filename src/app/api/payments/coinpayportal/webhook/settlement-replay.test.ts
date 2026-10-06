import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

// Replays CoinPay webhook payloads against an in-memory database and asserts
// on the rows that result (PRD 05 bugs 1-4).

let db: FakeSupabase;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn().mockResolvedValue(null),
  onPaymentReceived: vi.fn().mockResolvedValue(false),
  onPaymentSent: vi.fn().mockResolvedValue(false),
}));

import { POST } from "./route";

const SECRET = "replay_secret";
const USER = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;

function sign(body: string) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function replay(type: string, data: Record<string, unknown>) {
  const body = JSON.stringify({
    id: `evt_${Math.random()}`,
    type,
    data: { status: type.split(".")[1], amount_crypto: "1.5", currency: "usdc_pol", ...data },
    created_at: new Date().toISOString(),
    business_id: "biz",
  });
  const res = await POST(
    new NextRequest("http://localhost/api/payments/coinpayportal/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CoinPay-Signature": sign(body) },
      body,
    })
  );
  expect(res.status).toBe(200);
}

function sub() {
  return db.tables.subscriptions.find((s) => s.user_id === USER);
}
function payment(cpId: string) {
  return db.tables.payments.find((p) => p.coinpay_payment_id === cpId)!;
}
function monthsBetween(a: string | Date, b: string | Date) {
  const x = new Date(a);
  const y = new Date(b);
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
}

function seedCheckout(
  cpId: string,
  opts: { type?: string; plan?: string | null; amount?: number; status?: string } = {}
) {
  const metadata: Record<string, unknown> = { checkout_url: "https://pay.example/x" };
  if (opts.plan) metadata.plan = opts.plan;
  db.tables.payments.push({
    id: `local-${cpId}`,
    user_id: USER,
    coinpay_payment_id: cpId,
    amount_usd: opts.amount ?? 9,
    currency: "usdc_pol",
    status: opts.status ?? "pending",
    type: opts.type ?? "subscription",
    metadata,
  });
}

beforeEach(() => {
  process.env.COINPAY_WEBHOOK_SECRET = SECRET;
  db = createFakeSupabase({
    payments: [],
    funding_payments: [],
    funding_rewards_log: [],
    subscriptions: [{ id: "sub-1", user_id: USER, plan: "free", status: "active" }],
    notifications: [],
    gig_invoices: [],
    bounty_submissions: [],
  });
});

describe("funding payments (bug 1)", () => {
  function seedFunding(cpId: string, amount: number, userId: string | null = USER) {
    db.tables.funding_payments.push({
      id: `fund-${cpId}`,
      user_id: userId,
      coinpay_payment_id: cpId,
      amount_usd: amount,
      status: "pending",
      paid_at: null,
    });
  }

  it("a $50 funding payment grants Lifetime and writes funding_rewards_log once", async () => {
    seedFunding("cp-fund-50", 50);
    const data = { payment_id: "cp-fund-50", amount_usd: "50", metadata: { type: "funding", user_id: USER } };

    await replay("payment.confirmed", data);
    await replay("payment.forwarded", data);
    await replay("payment.confirmed", data);

    expect(sub()).toMatchObject({ plan: "lifetime", status: "active", current_period_end: null });
    expect(db.tables.funding_rewards_log).toHaveLength(1);
    expect(db.tables.funding_rewards_log[0]).toMatchObject({
      user_id: USER,
      funding_payment_id: "fund-cp-fund-50",
      reward_type: "lifetime",
    });
    expect(db.tables.notifications.filter((n) => n.data?.reward === "lifetime")).toHaveLength(1);
    const row = db.tables.funding_payments[0];
    expect(row.status).toBe("forwarded");
    expect(row.paid_at).toBeTruthy();
  });

  it("forwarded alone also grants the funding reward", async () => {
    seedFunding("cp-fund-75", 75);
    await replay("payment.forwarded", { payment_id: "cp-fund-75", amount_usd: "75", metadata: { type: "funding" } });
    expect(sub()?.plan).toBe("lifetime");
    expect(db.tables.funding_rewards_log).toHaveLength(1);
  });

  it("under $50 grants nothing", async () => {
    seedFunding("cp-fund-20", 20);
    await replay("payment.confirmed", { payment_id: "cp-fund-20", amount_usd: "20", metadata: { type: "funding" } });
    expect(sub()?.plan).toBe("free");
    expect(db.tables.funding_rewards_log).toHaveLength(0);
    expect(db.tables.funding_payments[0].status).toBe("confirmed");
  });

  it("an anonymous $50+ contribution is recorded without a grant", async () => {
    seedFunding("cp-fund-anon", 100, null);
    await replay("payment.confirmed", { payment_id: "cp-fund-anon", amount_usd: "100", metadata: { type: "funding" } });
    expect(db.tables.funding_payments[0].status).toBe("confirmed");
    expect(db.tables.funding_rewards_log).toHaveLength(0);
  });

  it("a late expired/failed event never un-pays a funding payment", async () => {
    seedFunding("cp-fund-late", 10);
    const data = { payment_id: "cp-fund-late", amount_usd: "10", metadata: { type: "funding" } };
    await replay("payment.confirmed", data);
    await replay("payment.expired", data);
    await replay("payment.failed", data);
    expect(db.tables.funding_payments[0].status).toBe("confirmed");
  });

  it("does not downgrade a user who already has Lifetime", async () => {
    db.tables.subscriptions[0].plan = "lifetime";
    seedFunding("cp-fund-again", 60);
    await replay("payment.confirmed", { payment_id: "cp-fund-again", amount_usd: "60", metadata: { type: "funding" } });
    expect(sub()?.plan).toBe("lifetime");
    expect(db.tables.notifications).toHaveLength(0);
  });
});

describe("forwarded without confirmed (bug 2)", () => {
  it("activates monthly Pro once and merges metadata", async () => {
    seedCheckout("cp-m1", { plan: "monthly" });
    const data = { payment_id: "cp-m1", amount_usd: "9", tx_hash: "0xabc", merchant_tx_hash: "0xdef" };

    await replay("payment.forwarded", data);
    await replay("payment.forwarded", data);

    const s = sub()!;
    expect(s).toMatchObject({ plan: "pro", status: "active", coinpay_payment_id: "cp-m1" });
    expect(monthsBetween(new Date(), s.current_period_end)).toBe(1);
    expect(db.tables.notifications.filter((n) => n.title === "Pro subscription activated")).toHaveLength(1);

    const p = payment("cp-m1");
    expect(p.status).toBe("forwarded");
    expect(p.metadata).toMatchObject({
      checkout_url: "https://pay.example/x",
      plan: "monthly",
      tx_hash: "0xabc",
      merchant_tx_hash: "0xdef",
    });
  });

  it("confirmed then forwarded activates once and ends forwarded", async () => {
    seedCheckout("cp-m2", { plan: "monthly" });
    await replay("payment.confirmed", { payment_id: "cp-m2", amount_usd: "9" });
    await replay("payment.forwarded", { payment_id: "cp-m2", amount_usd: "9", merchant_tx_hash: "0x1" });

    expect(payment("cp-m2").status).toBe("forwarded");
    expect(monthsBetween(new Date(), sub()!.current_period_end)).toBe(1);
    expect(db.tables.notifications).toHaveLength(1);
  });

  it("a confirmed arriving after forwarded does not move the status back", async () => {
    seedCheckout("cp-m3", { plan: "monthly" });
    await replay("payment.forwarded", { payment_id: "cp-m3", amount_usd: "9" });
    await replay("payment.confirmed", { payment_id: "cp-m3", amount_usd: "9" });
    expect(payment("cp-m3").status).toBe("forwarded");
    expect(db.tables.notifications).toHaveLength(1);
  });
});

describe("plan carried from create to webhook (bug 3)", () => {
  it("annual grants 12 months", async () => {
    seedCheckout("cp-a1", { plan: "annual", amount: 90 });
    await replay("payment.confirmed", { payment_id: "cp-a1", amount_usd: "90" });
    expect(monthsBetween(new Date(), sub()!.current_period_end)).toBe(12);
  });

  it("falls back to the plan in the payload metadata and stores it locally", async () => {
    seedCheckout("cp-a2", { plan: null, amount: 90 });
    await replay("payment.confirmed", {
      payment_id: "cp-a2",
      amount_usd: "90",
      metadata: { type: "subscription", plan: "annual", user_id: USER },
    });
    expect(monthsBetween(new Date(), sub()!.current_period_end)).toBe(12);
    expect(payment("cp-a2").metadata.plan).toBe("annual");
  });

  it("lifetime sets plan lifetime with no end date", async () => {
    db.tables.subscriptions[0] = {
      id: "sub-1",
      user_id: USER,
      plan: "pro",
      status: "active",
      current_period_end: new Date(Date.now() + 5 * DAY).toISOString(),
    };
    seedCheckout("cp-l1", { plan: "lifetime", amount: 100 });
    await replay("payment.forwarded", { payment_id: "cp-l1", amount_usd: "100" });
    expect(sub()).toMatchObject({ plan: "lifetime", status: "active", current_period_end: null });
  });

  it("paying early extends from the current end date", async () => {
    const end = new Date(Date.now() + 10 * DAY);
    db.tables.subscriptions[0] = {
      id: "sub-1",
      user_id: USER,
      plan: "pro",
      status: "active",
      stripe_subscription_id: null,
      current_period_start: new Date(Date.now() - 20 * DAY).toISOString(),
      current_period_end: end.toISOString(),
    };
    seedCheckout("cp-renew", { plan: "monthly" });
    await replay("payment.confirmed", { payment_id: "cp-renew", amount_usd: "9" });
    expect(monthsBetween(end, sub()!.current_period_end)).toBe(1);
    expect(new Date(sub()!.current_period_end).getDate()).toBe(end.getDate());
  });

  it("a Pro payment never downgrades a Lifetime member", async () => {
    db.tables.subscriptions[0].plan = "lifetime";
    seedCheckout("cp-m-life", { plan: "monthly" });
    await replay("payment.confirmed", { payment_id: "cp-m-life", amount_usd: "9" });
    expect(sub()?.plan).toBe("lifetime");
  });
});

describe("failed and expired (bug 4)", () => {
  it("payment.failed marks a pending payment failed", async () => {
    seedCheckout("cp-f1", { plan: "monthly" });
    await replay("payment.failed", { payment_id: "cp-f1" });
    expect(payment("cp-f1").status).toBe("failed");
    expect(sub()?.plan).toBe("free");
  });

  it("failed or expired after confirmed leaves the payment confirmed", async () => {
    seedCheckout("cp-f2", { plan: "monthly" });
    await replay("payment.confirmed", { payment_id: "cp-f2", amount_usd: "9" });
    await replay("payment.failed", { payment_id: "cp-f2" });
    await replay("payment.expired", { payment_id: "cp-f2" });
    expect(payment("cp-f2").status).toBe("confirmed");
    expect(sub()?.plan).toBe("pro");
  });

  it("a payment that arrives after expiry still activates", async () => {
    seedCheckout("cp-late", { plan: "monthly", status: "expired" });
    await replay("payment.confirmed", { payment_id: "cp-late", amount_usd: "9" });
    expect(payment("cp-late").status).toBe("confirmed");
    expect(sub()?.plan).toBe("pro");
  });
});
