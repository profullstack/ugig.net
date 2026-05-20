import { describe, it, expect } from "vitest";
import { calculateCommission, calculatePlatformFee, recordConversion } from "./commission";

describe("calculateCommission", () => {
  it("calculates percentage commission", () => {
    const result = calculateCommission(
      { commission_rate: 0.20, commission_type: "percentage", commission_flat_sats: 0 },
      10000
    );
    expect(result).toBe(2000);
  });

  it("calculates flat commission", () => {
    const result = calculateCommission(
      { commission_rate: 0.20, commission_type: "flat", commission_flat_sats: 500 },
      10000
    );
    expect(result).toBe(500);
  });

  it("floors fractional sats", () => {
    const result = calculateCommission(
      { commission_rate: 0.15, commission_type: "percentage", commission_flat_sats: 0 },
      333
    );
    expect(result).toBe(49); // floor(333 * 0.15 = 49.95)
  });

  it("returns 0 for flat with no amount set", () => {
    const result = calculateCommission(
      { commission_rate: 0.20, commission_type: "flat", commission_flat_sats: 0 },
      10000
    );
    expect(result).toBe(0);
  });
});

describe("calculatePlatformFee", () => {
  it("takes 5% of commission", () => {
    expect(calculatePlatformFee(2000)).toBe(100); // 5% of 2000
  });

  it("floors fractional amounts", () => {
    expect(calculatePlatformFee(333)).toBe(16); // floor(333 * 0.05 = 16.65)
  });

  it("returns 0 for zero commission", () => {
    expect(calculatePlatformFee(0)).toBe(0);
  });
});

function createAdminMock(options: {
  existingConversion?: { id: string; commission_sats: number; settles_at: string };
  existingConversionAfterInsertConflict?: { id: string; commission_sats: number; settles_at: string };
  insertError?: { code?: string; message: string };
} = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  let conversionLookupCount = 0;

  const admin = {
    from(table: string) {
      const query = {
        table,
        op: "",
        payload: undefined as unknown,
        select() {
          this.op = "select";
          calls.push({ table, op: "select" });
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          calls.push({ table, op: "maybeSingle" });
          if (table === "affiliate_conversions") {
            conversionLookupCount += 1;
            const conversion =
              conversionLookupCount === 1
                ? options.existingConversion
                : options.existingConversionAfterInsertConflict;

            return Promise.resolve({ data: conversion ?? null, error: null });
          }

          return Promise.resolve({ data: null, error: null });
        },
        single() {
          calls.push({ table, op: `${this.op}.single` });

          if (table === "affiliate_offers") {
            return Promise.resolve({
              data: {
                id: "offer_1",
                seller_id: "seller_1",
                commission_rate: 0.2,
                commission_type: "percentage",
                commission_flat_sats: 0,
                settlement_delay_days: 7,
                total_conversions: 1,
                total_revenue_sats: 10000,
                total_commissions_sats: 2000,
              },
              error: null,
            });
          }

          if (table === "affiliate_conversions" && this.payload) {
            if (options.insertError) {
              return Promise.resolve({ data: null, error: options.insertError });
            }

            return Promise.resolve({ data: { id: "conversion_1" }, error: null });
          }

          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: unknown) {
          this.op = "insert";
          this.payload = payload;
          calls.push({ table, op: "insert", payload });
          return this;
        },
        update(payload: unknown) {
          this.op = "update";
          this.payload = payload;
          calls.push({ table, op: "update", payload });
          return this;
        },
        limit() {
          return this;
        },
        lte() {
          return this;
        },
      };

      return query;
    },
  };

  return { admin, calls };
}

describe("recordConversion", () => {
  it("returns an existing purchase conversion without inserting or incrementing metrics", async () => {
    const existingConversion = {
      id: "conversion_existing",
      commission_sats: 2500,
      settles_at: "2026-05-27T00:00:00.000Z",
    };
    const { admin, calls } = createAdminMock({ existingConversion });

    const result = await recordConversion(admin as never, {
      offerId: "offer_1",
      affiliateId: "affiliate_1",
      purchaseId: "purchase_1",
      saleAmountSats: 12500,
    });

    expect(result).toEqual({
      ok: true,
      conversion_id: "conversion_existing",
      commission_sats: 2500,
      settles_at: "2026-05-27T00:00:00.000Z",
    });
    expect(calls.some((call) => call.op === "insert")).toBe(false);
    expect(calls.some((call) => call.op === "update")).toBe(false);
    expect(calls.some((call) => call.table === "affiliate_offers")).toBe(false);
  });

  it("returns the existing conversion after a unique-index race", async () => {
    const { admin, calls } = createAdminMock({
      insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
      existingConversionAfterInsertConflict: {
        id: "conversion_winner",
        commission_sats: 2000,
        settles_at: "2026-05-27T00:00:00.000Z",
      },
    });

    const result = await recordConversion(admin as never, {
      offerId: "offer_1",
      affiliateId: "affiliate_1",
      purchaseId: "purchase_1",
      saleAmountSats: 10000,
    });

    expect(result).toEqual({
      ok: true,
      conversion_id: "conversion_winner",
      commission_sats: 2000,
      settles_at: "2026-05-27T00:00:00.000Z",
    });
    expect(calls.filter((call) => call.op === "insert")).toHaveLength(1);
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });
});
