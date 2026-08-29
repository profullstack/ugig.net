import { describe, expect, it } from "vitest";
import {
  bountyToWorkEvent,
  invoiceToWorkEvents,
  toWorkEvents,
  type StatsBountySubmission,
  type StatsInvoice,
} from "./work-events";

const paidInvoice: StatsInvoice = {
  status: "paid",
  amount_usd: 100,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  metadata: { paid_at: "2026-08-04T12:00:00Z" },
  gig: { title: "Ship the billing page" },
  items: [
    { description: "PRs merged", quantity: 4, amount_usd: 80 },
    { description: "Design review", quantity: 1, amount_usd: 20 },
  ],
};

describe("invoiceToWorkEvents", () => {
  it("ignores invoices that were never paid", () => {
    expect(invoiceToWorkEvents({ ...paidInvoice, status: "sent" })).toEqual([]);
    expect(invoiceToWorkEvents({ ...paidInvoice, status: "cancelled" })).toEqual([]);
  });

  it("emits one event per line item with its billed quantity", () => {
    const events = invoiceToWorkEvents(paidInvoice);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ label: "PRs merged", units: 4, costUsd: 80 });
    expect(events[1]).toMatchObject({ label: "Design review", units: 1, costUsd: 20 });
  });

  it("dates events by paid_at, then updated_at, then created_at", () => {
    expect(invoiceToWorkEvents(paidInvoice)[0].at).toBe("2026-08-04T12:00:00Z");
    expect(
      invoiceToWorkEvents({ ...paidInvoice, metadata: {} })[0].at
    ).toBe("2026-08-05T00:00:00Z");
    expect(
      invoiceToWorkEvents({ ...paidInvoice, metadata: null, updated_at: null })[0].at
    ).toBe("2026-08-01T00:00:00Z");
  });

  it("keeps the invoice total authoritative when the item sum has drifted", () => {
    const events = invoiceToWorkEvents({
      ...paidInvoice,
      amount_usd: 90,
      items: [
        { description: "PRs merged", quantity: 4, amount_usd: 80 },
        { description: "Design review", quantity: 1, amount_usd: 20 },
      ],
    });
    expect(events.reduce((s, e) => s + e.costUsd, 0)).toBeCloseTo(90);
    expect(events[0].costUsd).toBeCloseTo(72);
  });

  it("treats an un-itemized invoice as a single unit of work", () => {
    const events = invoiceToWorkEvents({ ...paidInvoice, items: [] });
    expect(events).toEqual([
      {
        at: "2026-08-04T12:00:00Z",
        costUsd: 100,
        units: 1,
        label: "Ship the billing page",
        source: "invoice",
      },
    ]);
  });

  it("prefers the metadata category over the gig title for the fallback label", () => {
    const events = invoiceToWorkEvents({
      ...paidInvoice,
      items: null,
      metadata: { paid_at: "2026-08-04T12:00:00Z", category: "Frontend" },
    });
    expect(events[0].label).toBe("Frontend");
  });

  it("coerces numeric strings, which is how numeric columns arrive", () => {
    const events = invoiceToWorkEvents({
      ...paidInvoice,
      amount_usd: "100.00",
      items: [{ description: "PRs merged", quantity: "4", amount_usd: "100.00" }],
    });
    expect(events[0]).toMatchObject({ costUsd: 100, units: 4 });
  });

  it("falls back to one unit when the quantity is missing or zero", () => {
    const events = invoiceToWorkEvents({
      ...paidInvoice,
      items: [{ description: "Flat fee", quantity: null, amount_usd: 100 }],
    });
    expect(events[0].units).toBe(1);
  });

  it("does not divide by a zero item total", () => {
    const events = invoiceToWorkEvents({
      ...paidInvoice,
      items: [{ description: "Comped", quantity: 2, amount_usd: 0 }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ costUsd: 100, units: 1 });
  });
});

const paidSubmission: StatsBountySubmission = {
  payout_status: "paid",
  paid_at: "2026-08-10T00:00:00Z",
  created_at: "2026-08-09T00:00:00Z",
  bounty: { title: "Find a race condition", payout_usd: 50 },
};

describe("bountyToWorkEvent", () => {
  it("counts a paid submission as one unit at the bounty payout", () => {
    expect(bountyToWorkEvent(paidSubmission)).toEqual({
      at: "2026-08-10T00:00:00Z",
      costUsd: 50,
      units: 1,
      label: "Find a race condition",
      source: "bounty",
    });
  });

  it("ignores approved-but-unpaid and invoiced submissions", () => {
    expect(bountyToWorkEvent({ ...paidSubmission, payout_status: "unpaid" })).toBeNull();
    expect(bountyToWorkEvent({ ...paidSubmission, payout_status: "invoiced" })).toBeNull();
  });

  it("ignores a submission whose bounty carries no payout", () => {
    expect(bountyToWorkEvent({ ...paidSubmission, bounty: null })).toBeNull();
  });

  it("falls back to created_at when paid_at was never written", () => {
    expect(
      bountyToWorkEvent({ ...paidSubmission, paid_at: null, updated_at: null })?.at
    ).toBe("2026-08-09T00:00:00Z");
  });
});

describe("toWorkEvents", () => {
  it("merges both sources into one timeline, oldest first", () => {
    const events = toWorkEvents([paidInvoice], [paidSubmission]);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.source)).toEqual(["invoice", "invoice", "bounty"]);
  });
});
