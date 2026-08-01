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

/** The component takes labelled rows now; tests still think in ids. */
function payable(ids: string[]) {
  return ids.map((id, i) => ({ id, label: `Worker ${i} — Gig ${i}`, amountUsd: 50 }));
}

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
  fireEvent.click(screen.getByRole("button", { name: /Pay 2/ }));
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
    const { container } = render(<BulkPayAccepted invoices={[]} totalUsd={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("prompts to install the wallet when the extension is absent", () => {
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);

    expect(screen.getByText(/Install the CoinPay wallet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay \\d/ })).not.toBeInTheDocument();
  });

  it("offers the bulk action once the wallet is detected", () => {
    installWallet();
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);

    expect(screen.getByRole("button", { name: /Pay 2/ })).toBeInTheDocument();
    expect(screen.getByText(/2 of 2 selected/)).toBeInTheDocument();
  });

  it("detects a wallet that finishes injecting after mount", async () => {
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
    expect(screen.queryByRole("button", { name: /^Pay \\d/ })).not.toBeInTheDocument();

    installWallet();
    act(() => {
      window.dispatchEvent(new Event("coinpay#initialized"));
    });

    expect(await screen.findByRole("button", { name: /Pay 2/ })).toBeInTheDocument();
  });

  it("prepares payment requests for the accepted invoices", async () => {
    installWallet();
    const fetchMock = mockFetch();
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);

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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);

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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);

    await openConfirmation();

    // An invoice silently missing from the run would look paid when it isn't.
    expect(screen.getByText(/1 invoice will be skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Not accepted yet/)).toBeInTheDocument();
  });

  it("hands the prepared payments to the wallet on approval", async () => {
    const wallet = installWallet();
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    expect(await screen.findByText("Payment request rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve in wallet/ })).toBeInTheDocument();
  });

  it("prepares a large batch in chunks instead of one long request", async () => {
    // The hang this guards: 80 invoices in a single request sat open long
    // enough for the connection to drop, so the user saw "Network error" and
    // the wallet was never given anything to approve.
    installWallet();
    const many = Array.from({ length: 45 }, (_, i) => `inv-${i}`);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const ids = JSON.parse(String(init?.body ?? "{}")).invoice_ids as string[];
      return {
        ok: true,
        json: async () => ({
          data: {
            payments: ids.map((id) => ({
              id,
              gig_id: "g",
              chain: "usdc_pol",
              to: "0xabc",
              amount: "1",
              label: id,
              amountUsd: 1,
              expires_at: "2030-01-01T00:00:00Z",
              reused: false,
            })),
            skipped: [],
            total_usd: ids.length,
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BulkPayAccepted invoices={payable(many)} totalUsd={45} />);
    fireEvent.click(screen.getByRole("button", { name: /Pay 45/ }));

    await screen.findByRole("button", { name: /Approve in wallet/ });

    // Several short requests, not one long one, and every invoice accounted for.
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes("bulk-payment-request"));
    expect(calls.length).toBeGreaterThan(1);
    const sent = calls.flatMap(([, init]) => JSON.parse(String(init?.body)).invoice_ids);
    expect(sent).toHaveLength(45);
    expect(new Set(sent).size).toBe(45);
    expect(calls.every(([, init]) => JSON.parse(String(init?.body)).invoice_ids.length <= 20)).toBe(true);
  });

  it("keeps the quotes it already minted when a later chunk fails", async () => {
    installWallet();
    const many = Array.from({ length: 40 }, (_, i) => `inv-${i}`);
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!String(url).includes("bulk-payment-request")) {
          return { ok: true, json: async () => ({ data: {} }) };
        }
        const ids = JSON.parse(String(init?.body ?? "{}")).invoice_ids as string[];
        call++;
        // Second chunk dies the way a dropped connection does.
        if (call === 2) throw new Error("network down");
        return {
          ok: true,
          json: async () => ({
            data: {
              payments: ids.map((id) => ({
                id,
                gig_id: "g",
                chain: "usdc_pol",
                to: "0xabc",
                amount: "1",
                label: id,
                amountUsd: 1,
                expires_at: "2030-01-01T00:00:00Z",
                reused: false,
              })),
              skipped: [],
              total_usd: ids.length,
            },
          }),
        };
      })
    );

    render(<BulkPayAccepted invoices={payable(many)} totalUsd={40} />);
    fireEvent.click(screen.getByRole("button", { name: /Pay 40/ }));

    // Still reaches the confirmation step with the successful chunks intact,
    // rather than throwing the whole run away.
    await screen.findByRole("button", { name: /Approve in wallet/ });
    expect(screen.getByText(/were limited/)).toBeInTheDocument();
  });

  it("surfaces a preparation failure without opening the wallet", async () => {
    const wallet = installWallet();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "CoinPay is down" }) }))
    );
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);

    fireEvent.click(screen.getByRole("button", { name: /Pay 2/ }));

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
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

    // The payments are already on-chain; a failed record call must not read as
    // a failed payment.
    expect(await screen.findByText(/2 payments broadcast/)).toBeInTheDocument();
  });

  it("lets the user back out of the confirmation", async () => {
    const wallet = installWallet();
    render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("button", { name: /Pay 2/ })).toBeInTheDocument();
    expect(wallet.payBatch).not.toHaveBeenCalled();
  });
});
