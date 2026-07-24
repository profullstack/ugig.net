import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/get-user", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

import { POST } from "./route";
import { getAuthContext } from "@/lib/auth/get-user";
import { createServiceClient } from "@/lib/supabase/service";

const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const ID_A = "f53e4a56-3cf7-42f9-9a33-bc1cb770c4f6";
const ID_B = "a1b2c3d4-1111-4222-8333-444455556666";

function request(body: unknown) {
  return { json: async () => body } as any;
}

function selectQuery(rows: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return query;
}

/** Captures every metadata write so tests can assert on what was persisted. */
function serviceClient(updates: Record<string, any>) {
  return {
    from: vi.fn(() => ({
      update: vi.fn((row: any) => ({
        eq: vi.fn((_col: string, id: string) => {
          updates[id] = row;
          return Promise.resolve({ error: null });
        }),
      })),
    })),
  };
}

function mockAuth(rows: any[], updates: Record<string, any> = {}) {
  (getAuthContext as any).mockResolvedValue({
    user: { id: POSTER_ID },
    supabase: { from: vi.fn(() => selectQuery(rows)) },
  });
  (createServiceClient as any).mockReturnValue(serviceClient(updates));
  return updates;
}

function invoiceRow(id: string, metadata: Record<string, unknown> = {}) {
  return { id, status: "sent", metadata };
}

describe("POST /api/invoices/bulk-payment-record", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the broadcast hash for a sent payment", async () => {
    const updates = mockAuth([invoiceRow(ID_A)]);

    const res = await POST(
      request({
        results: [
          {
            invoice_id: ID_A,
            status: "sent",
            tx_hash: "0xabc123",
            explorer_url: "https://etherscan.io/tx/0xabc123",
          },
        ],
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ recorded: 1, sent: 1, failed: 0 });
    expect(updates[ID_A].metadata).toMatchObject({
      payer_tx_hash: "0xabc123",
      payer_tx_explorer_url: "https://etherscan.io/tx/0xabc123",
      coinpay_status: "broadcast",
    });
  });

  it("never marks an invoice paid — confirmation stays with the webhook", async () => {
    const updates = mockAuth([invoiceRow(ID_A)]);

    await POST(
      request({ results: [{ invoice_id: ID_A, status: "sent", tx_hash: "0xabc" }] })
    );

    // A payer-supplied hash is a claim, not a settlement.
    expect(updates[ID_A]).not.toHaveProperty("status");
    expect(updates[ID_A].metadata.coinpay_status).not.toBe("paid");
  });

  it("does not downgrade an invoice the webhook already confirmed", async () => {
    const updates = mockAuth([invoiceRow(ID_A, { coinpay_status: "paid" })]);

    await POST(
      request({ results: [{ invoice_id: ID_A, status: "sent", tx_hash: "0xabc" }] })
    );

    expect(updates[ID_A].metadata.coinpay_status).toBe("paid");
  });

  it("records the reason a payment was not sent", async () => {
    const updates = mockAuth([invoiceRow(ID_A)]);

    const res = await POST(
      request({
        results: [{ invoice_id: ID_A, status: "failed", error: "Insufficient funds" }],
      })
    );

    const body = await res.json();
    expect(body.data).toMatchObject({ sent: 0, failed: 1 });
    expect(updates[ID_A].metadata).toMatchObject({
      last_bulk_payment_error: "Insufficient funds",
    });
    expect(updates[ID_A].metadata).not.toHaveProperty("payer_tx_hash");
  });

  it("appends to the attempt history rather than overwriting it", async () => {
    const updates = mockAuth([
      invoiceRow(ID_A, {
        bulk_payment_attempts: [{ status: "failed", error: "nonce too low" }],
      }),
    ]);

    await POST(
      request({ results: [{ invoice_id: ID_A, status: "sent", tx_hash: "0xdef" }] })
    );

    const attempts = updates[ID_A].metadata.bulk_payment_attempts;
    // Earlier hashes are what explain a duplicate on-chain payment later.
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ status: "failed" });
    expect(attempts[1]).toMatchObject({ status: "sent", tx_hash: "0xdef" });
  });

  it("reports invoices the caller does not own as unknown, writing nothing", async () => {
    const updates = mockAuth([invoiceRow(ID_A)]);

    const res = await POST(
      request({
        results: [
          { invoice_id: ID_A, status: "sent", tx_hash: "0x1" },
          { invoice_id: ID_B, status: "sent", tx_hash: "0x2" },
        ],
      })
    );

    const body = await res.json();
    expect(body.data.recorded).toBe(1);
    expect(body.data.unknown).toEqual([ID_B]);
    expect(updates[ID_B]).toBeUndefined();
  });

  it("requires authentication", async () => {
    (getAuthContext as any).mockResolvedValue(null);

    const res = await POST(
      request({ results: [{ invoice_id: ID_A, status: "sent", tx_hash: "0x1" }] })
    );

    expect(res.status).toBe(401);
  });

  it("rejects malformed results", async () => {
    mockAuth([]);

    expect((await POST(request({ results: [] }))).status).toBe(400);
    expect(
      (await POST(request({ results: [{ invoice_id: ID_A, status: "bogus" }] }))).status
    ).toBe(400);
    expect(
      (await POST(request({ results: [{ invoice_id: "nope", status: "sent" }] }))).status
    ).toBe(400);
  });
});
