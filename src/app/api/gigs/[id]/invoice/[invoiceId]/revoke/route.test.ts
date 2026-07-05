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

const GIG_ID = "8489a861-0999-4107-afca-2592021ac338";
const INVOICE_ID = "f53e4a56-3cf7-42f9-9a33-bc1cb770c4f6";
const POSTER_ID = "4f16c625-c37a-4654-82db-e391067cbb13";
const WORKER_ID = "666cbaba-c6ea-4756-ad44-d6a5b4248f8f";

const params = { params: Promise.resolve({ id: GIG_ID, invoiceId: INVOICE_ID }) };

function invoiceQuery(invoice: any) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: invoice, error: null }),
  };
}

// Records the row passed to update() so the test can assert on it.
function updateSpy(onUpdate: (row: any) => void) {
  return {
    update: vi.fn((row: any) => {
      onUpdate(row);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    }),
  };
}

function baseInvoice(status: string) {
  return {
    id: INVOICE_ID,
    gig_id: GIG_ID,
    worker_id: WORKER_ID,
    poster_id: POSTER_ID,
    amount_usd: 125,
    status,
    gig: { id: GIG_ID, title: "Build thing" },
  };
}

describe("POST /api/gigs/[id]/invoice/[invoiceId]/revoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the sender cancel a sent invoice and notifies the payer", async () => {
    let updatePayload: any = null;
    let notification: any = null;

    (getAuthContext as any).mockResolvedValue({
      user: { id: WORKER_ID },
      supabase: {
        from: vi.fn(() => ({
          ...invoiceQuery(baseInvoice("sent")),
          ...updateSpy((row) => {
            updatePayload = row;
          }),
        })),
      },
    });
    (createServiceClient as any).mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn((row: any) => {
          notification = row;
          return Promise.resolve({ error: null });
        }),
      })),
    });

    const res = await POST({} as any, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ invoice_id: INVOICE_ID, status: "cancelled" });
    expect(updatePayload).toMatchObject({ status: "cancelled" });
    expect(notification).toMatchObject({
      user_id: POSTER_ID,
      title: "Invoice revoked",
    });
  });

  it("blocks anyone but the sender from revoking", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: POSTER_ID },
      supabase: { from: vi.fn(() => invoiceQuery(baseInvoice("sent"))) },
    });

    const res = await POST({} as any, params);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Only the sender can revoke this invoice");
  });

  it("refuses to revoke a paid invoice", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: WORKER_ID },
      supabase: { from: vi.fn(() => invoiceQuery(baseInvoice("paid"))) },
    });

    const res = await POST({} as any, params);

    expect(res.status).toBe(409);
  });

  it("is idempotent when the invoice is already cancelled", async () => {
    (getAuthContext as any).mockResolvedValue({
      user: { id: WORKER_ID },
      supabase: { from: vi.fn(() => invoiceQuery(baseInvoice("cancelled"))) },
    });

    const res = await POST({} as any, params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ invoice_id: INVOICE_ID, status: "cancelled" });
  });
});
