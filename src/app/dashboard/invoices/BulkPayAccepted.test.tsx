import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BulkPayAccepted } from "./BulkPayAccepted";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const INVOICE_IDS = ["inv-1", "inv-2"];

const PREPARED = {
  data: {
    payments: [
      {
        id: "inv-1",
        gig_id: "gig-1",
        chain: "usdc_pol",
        to: "0xabc",
        amount: "25",
        label: "Ada Lovelace — Fix login",
        amountUsd: 25,
        expires_at: "2030-01-01T00:00:00Z",
        reused: false,
      },
      {
        id: "inv-2",
        gig_id: "gig-2",
        chain: "usdc_pol",
        to: "0xdef",
        amount: "75",
        label: "Grace Hopper — Ship compiler",
        amountUsd: 75,
        expires_at: "2030-01-01T00:00:00Z",
        reused: false,
      },
    ],
    skipped: [],
    total_usd: 100,
  },
};

/** Install a fake `window.coinpay`, as the extension would. */
function installWallet(overrides: Record<string, unknown> = {}) {
  const provider = {
    isCoinPay: true,
    version: "0.1.0",
    getState: vi.fn(async () => ({ initialized: true, unlocked: true, connected: true })),
    connect: vi.fn(async () => ({ accounts: [] })),
    getAccounts: vi.fn(async () => ({ accounts: [] })),
    payBatch: vi.fn(async (_payments: unknown[], _options?: unknown) => ({
      results: [
        { id: "inv-1", chain: "usdc_pol", to: "0xabc", amount: "25", status: "sent", txHash: "0x1" },
        { id: "inv-2", chain: "usdc_pol", to: "0xdef", amount: "75", status: "sent", txHash: "0x2" },
      ],
    })),
    onProgress: vi.fn(() => () => {}),
    ...overrides,
  };
  (window as any).coinpay = provider;
  return provider;
}

/** Route fetches by URL so tests only specify what they care about. */
function mockFetch(handlers: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("bulk-payment-request")) {
      return {
        ok: true,
        json: async () => handlers.prepare ?? PREPARED,
      };
    }
    return { ok: true, json: async () => ({ data: { recorded: 2 } }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openConfirmation() {
  fireEvent.click(screen.getByRole("button", { name: /Pay all 2/ }));
  await screen.findByRole("button", { name: /Approve in wallet/ });
}

describe("BulkPayAccepted", () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (window as any).coinpay;
  });

  it("renders nothing when there is nothing accepted to pay", () => {
    installWallet();
    const { container } = render(<BulkPayAccepted invoiceIds={[]} totalUsd={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("prompts to install the wallet when the extension is absent", () => {
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);

    expect(screen.getByText(/Install the CoinPay wallet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay all/ })).not.toBeInTheDocument();
  });

  it("offers the bulk action once the wallet is detected", () => {
    installWallet();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);

    expect(screen.getByRole("button", { name: /Pay all 2/ })).toBeInTheDocument();
    expect(screen.getByText(/2 invoices · \$100\.00/)).toBeInTheDocument();
  });

  it("detects a wallet that finishes injecting after mount", async () => {
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    expect(screen.queryByRole("button", { name: /Pay all/ })).not.toBeInTheDocument();

    installWallet();
    act(() => {
      window.dispatchEvent(new Event("coinpay#initialized"));
    });

    expect(await screen.findByRole("button", { name: /Pay all 2/ })).toBeInTheDocument();
  });

  it("prepares payment requests for the accepted invoices", async () => {
    installWallet();
    const fetchMock = mockFetch();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);

    await openConfirmation();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invoices/bulk-payment-request",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ invoice_ids: INVOICE_IDS }),
      })
    );
    expect(screen.getByText(/2 payments/)).toBeInTheDocument();
  });

  it("does not touch the wallet before the user confirms", async () => {
    const wallet = installWallet();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);

    await openConfirmation();

    expect(wallet.payBatch).not.toHaveBeenCalled();
  });

  it("surfaces skipped invoices in the confirmation", async () => {
    installWallet();
    mockFetch({
      prepare: {
        data: {
          payments: PREPARED.data.payments.slice(0, 1),
          skipped: [{ id: "inv-2", reason: "Not accepted yet" }],
          total_usd: 25,
        },
      },
    });
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);

    await openConfirmation();

    // An invoice silently missing from the run would look paid when it isn't.
    expect(screen.getByText(/1 invoice will be skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Not accepted yet/)).toBeInTheDocument();
  });

  it("hands the prepared payments to the wallet on approval", async () => {
    const wallet = installWallet();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    await waitFor(() => expect(wallet.payBatch).toHaveBeenCalled());
    expect(wallet.connect).toHaveBeenCalled();
    const [payments] = wallet.payBatch.mock.calls[0];
    expect(payments).toEqual([
      { id: "inv-1", chain: "usdc_pol", to: "0xabc", amount: "25", label: "Ada Lovelace — Fix login", amountUsd: 25 },
      { id: "inv-2", chain: "usdc_pol", to: "0xdef", amount: "75", label: "Grace Hopper — Ship compiler", amountUsd: 75 },
    ]);
  });

  it("records the broadcast results afterwards", async () => {
    installWallet();
    const fetchMock = mockFetch();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invoices/bulk-payment-record",
        expect.objectContaining({ method: "POST" })
      )
    );
    const call = fetchMock.mock.calls.find((c: any[]) =>
      c[0].includes("bulk-payment-record")
    )!;
    expect(JSON.parse((call[1] as any).body).results).toEqual([
      { invoice_id: "inv-1", status: "sent", tx_hash: "0x1", explorer_url: undefined, error: undefined },
      { invoice_id: "inv-2", status: "sent", tx_hash: "0x2", explorer_url: undefined, error: undefined },
    ]);
  });

  it("summarizes a fully successful run", async () => {
    installWallet();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    expect(await screen.findByText(/2 payments broadcast/)).toBeInTheDocument();
    // Broadcast is not settlement — the copy must not claim "paid".
    expect(screen.getByText(/once each transaction confirms on-chain/)).toBeInTheDocument();
  });

  it("names the failures and offers to retry only those", async () => {
    const wallet = installWallet({
      payBatch: vi.fn(async (_payments: unknown[], _options?: unknown) => ({
        results: [
          { id: "inv-1", chain: "usdc_pol", to: "0xabc", amount: "25", status: "sent", txHash: "0x1" },
          {
            id: "inv-2",
            chain: "usdc_pol",
            to: "0xdef",
            amount: "75",
            status: "failed",
            error: "Insufficient funds",
          },
        ],
      })),
    });
    const fetchMock = mockFetch();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();
    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    expect(await screen.findByText(/1 payment broadcast, 1 not sent/)).toBeInTheDocument();
    expect(screen.getByText(/Grace Hopper — Ship compiler — Insufficient funds/)).toBeInTheDocument();

    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Retry the 1 that failed/ }));

    // Retrying the successful one would pay it a second time.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invoices/bulk-payment-request",
        expect.objectContaining({ body: JSON.stringify({ invoice_ids: ["inv-2"] }) })
      )
    );
    expect(wallet.payBatch).toHaveBeenCalledTimes(1);
  });

  it("reports a wallet rejection and stays on the confirmation step", async () => {
    installWallet({
      payBatch: vi.fn(async (_payments: unknown[], _options?: unknown) => {
        throw new Error("Payment request rejected");
      }),
    });
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    expect(await screen.findByText("Payment request rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve in wallet/ })).toBeInTheDocument();
  });

  it("surfaces a preparation failure without opening the wallet", async () => {
    const wallet = installWallet();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "CoinPay is down" }) }))
    );
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);

    fireEvent.click(screen.getByRole("button", { name: /Pay all 2/ }));

    expect(await screen.findByText("CoinPay is down")).toBeInTheDocument();
    expect(wallet.payBatch).not.toHaveBeenCalled();
  });

  it("still reports success when only the bookkeeping call fails", async () => {
    installWallet();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, _init?: RequestInit) => {
        if (url.includes("bulk-payment-request")) {
          return { ok: true, json: async () => PREPARED };
        }
        throw new Error("network down");
      })
    );
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    // The payments are already on-chain; a failed record call must not read as
    // a failed payment.
    expect(await screen.findByText(/2 payments broadcast/)).toBeInTheDocument();
  });

  it("lets the user back out of the confirmation", async () => {
    const wallet = installWallet();
    render(<BulkPayAccepted invoiceIds={INVOICE_IDS} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: /Pay all 2/ })).toBeInTheDocument();
    expect(wallet.payBatch).not.toHaveBeenCalled();
  });
});
