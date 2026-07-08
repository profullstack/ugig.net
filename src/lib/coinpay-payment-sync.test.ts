import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncBountyPaymentStatus, syncGigInvoicePaymentStatus } from "@/lib/coinpay-payment-sync";
import { getPaymentStatus } from "@/lib/coinpayportal";
import { onPaymentReceived, onPaymentSent } from "@/lib/reputation-hooks";

vi.mock("@/lib/coinpayportal", () => ({
  getPaymentStatus: vi.fn(),
}));

vi.mock("@/lib/reputation-hooks", () => ({
  getUserDid: vi.fn(async (_supabase, userId: string) => `did:ugig:${userId}`),
  onPaymentReceived: vi.fn(async () => true),
  onPaymentSent: vi.fn(async () => true),
}));

type Row = Record<string, any>;

function matches(row: Row, filters: Array<(row: Row) => boolean>) {
  return filters.every((filter) => filter(row));
}

function makeSupabase(initialTables: Record<string, Row[]>) {
  const tables = Object.fromEntries(
    Object.entries(initialTables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])
  ) as Record<string, Row[]>;

  const from = vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let updatePayload: Row | null = null;
    let limitCount: number | null = null;

    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return chain;
      }),
      neq: vi.fn((field: string, value: unknown) => {
        filters.push((row) => row[field] !== value);
        return chain;
      }),
      not: vi.fn((field: string, op: string, value: unknown) => {
        if (op === "is" && value === null) filters.push((row) => row[field] !== null);
        return chain;
      }),
      in: vi.fn((field: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[field]));
        return chain;
      }),
      order: vi.fn(() => chain),
      limit: vi.fn((count: number) => {
        limitCount = count;
        return chain;
      }),
      update: vi.fn((payload: Row) => {
        updatePayload = payload;
        return chain;
      }),
      insert: vi.fn(async (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        tables[table] = tables[table] || [];
        tables[table].push(...rows.map((row) => ({ ...row })));
        return { data: rows, error: null };
      }),
      maybeSingle: vi.fn(async () => executeSingle()),
      single: vi.fn(async () => executeSingle()),
      then: (resolve: any, reject: any) => Promise.resolve(executeList()).then(resolve, reject),
    };

    function selectedRows() {
      return (tables[table] || []).filter((row) => matches(row, filters));
    }

    function applyUpdate() {
      if (!updatePayload) return selectedRows();
      const rows = selectedRows();
      for (const row of rows) Object.assign(row, updatePayload);
      return rows;
    }

    function executeList() {
      const rows = applyUpdate();
      return {
        data: limitCount == null ? rows : rows.slice(0, limitCount),
        error: null,
      };
    }

    function executeSingle() {
      const rows = applyUpdate();
      return { data: rows[0] || null, error: null };
    }

    return chain;
  });

  return { supabase: { from } as any, tables, from };
}

describe("coinpay payment sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a confirmed bounty payout paid and records DID reputation", async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue({
      success: true,
      payment: {
        id: "cp-pay-1",
        status: "confirmed",
        tx_hash: "tx-1",
        crypto_amount: "0.5",
        blockchain: "SOL",
      },
    });

    const { supabase, tables } = makeSupabase({
      bounty_submissions: [
        {
          id: "sub-1",
          bounty_id: "bounty-1",
          submitter_id: "worker-1",
          payout_status: "invoiced",
          coinpay_invoice_id: "cp-pay-1",
          metadata: { payment_address: "So111" },
        },
      ],
      bounties: [
        {
          id: "bounty-1",
          title: "Fix it",
          creator_id: "creator-1",
          payout_usd: 25,
        },
      ],
      notifications: [],
    });

    const result = await syncBountyPaymentStatus(supabase, "cp-pay-1");

    expect(result.changed).toBe(true);
    expect(tables.bounty_submissions[0]).toMatchObject({
      payout_status: "paid",
      paid_at: expect.any(String),
      metadata: expect.objectContaining({
        coinpay_status: "confirmed",
        tx_hash: "tx-1",
        amount_crypto: "0.5",
        payment_currency: "SOL",
      }),
    });
    expect(tables.notifications).toHaveLength(2);
    expect(onPaymentSent).toHaveBeenCalled();
    expect(onPaymentReceived).toHaveBeenCalled();
  });

  it("resets an expired bounty payout so the creator can retry", async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue({
      success: true,
      payment: {
        id: "cp-pay-2",
        status: "expired",
        crypto_amount: "0.5",
        blockchain: "SOL",
      },
    });

    const { supabase, tables } = makeSupabase({
      bounty_submissions: [
        {
          id: "sub-1",
          bounty_id: "bounty-1",
          submitter_id: "worker-1",
          payout_status: "invoiced",
          coinpay_invoice_id: "cp-pay-2",
          pay_url: "https://coinpayportal.com/pay/cp-pay-2",
          metadata: { payment_address: "So111" },
        },
      ],
      bounties: [{ id: "bounty-1", title: "Fix it", creator_id: "creator-1" }],
      notifications: [],
    });

    const result = await syncBountyPaymentStatus(supabase, "cp-pay-2");

    expect(result.changed).toBe(true);
    expect(tables.bounty_submissions[0]).toMatchObject({
      payout_status: "unpaid",
      coinpay_invoice_id: null,
      pay_url: null,
      metadata: expect.objectContaining({
        coinpay_status: "expired",
        expired_coinpay_invoice_id: "cp-pay-2",
      }),
    });
    expect(tables.notifications[0]).toMatchObject({
      user_id: "creator-1",
      title: "Bounty payment expired",
    });
  });

  it("does not mark a rejected gig invoice paid when a stale CoinPay payment confirms", async () => {
    vi.mocked(getPaymentStatus).mockResolvedValue({
      success: true,
      payment: {
        id: "cp-invoice-stale",
        status: "confirmed",
        tx_hash: "tx-stale",
        crypto_amount: "0.5",
        blockchain: "SOL",
      },
    });

    const { supabase, tables } = makeSupabase({
      gig_invoices: [
        {
          id: "invoice-1",
          application_id: "app-1",
          gig_id: "gig-1",
          worker_id: "worker-1",
          poster_id: "poster-1",
          status: "rejected",
          amount_usd: 10,
          coinpay_invoice_id: "cp-invoice-stale",
          metadata: { rejection_reason: "duplicate" },
        },
      ],
      applications: [{ id: "app-1", status: "accepted" }],
      gigs: [{ id: "gig-1", title: "Fix it" }],
      notifications: [],
    });

    const result = await syncGigInvoicePaymentStatus(supabase, "cp-invoice-stale");

    expect(result).toMatchObject({
      changed: false,
      local_status: "rejected",
      upstream_status: "confirmed",
    });
    expect(tables.gig_invoices[0]).toMatchObject({
      status: "rejected",
      metadata: { rejection_reason: "duplicate" },
    });
    expect(tables.applications[0]).toMatchObject({ status: "accepted" });
    expect(tables.notifications).toHaveLength(0);
    expect(onPaymentSent).not.toHaveBeenCalled();
    expect(onPaymentReceived).not.toHaveBeenCalled();
  });

});
