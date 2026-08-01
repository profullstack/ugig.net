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

/** The component takes labelled rows now; tests still think in ids. Each id
 * gets its own payee by default, so filtering can be exercised. */
function payable(ids: string[]) {
  return ids.map((id, i) => ({
    id,
    label: `Worker ${i} — Gig ${i}`,
    amountUsd: 50,
    payeeId: `worker-${i}`,
    payeeName: `Worker ${i}`,
  }));
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

  /**
   * A wallet holds several addresses per chain and a batch spends exactly one.
   * Left to default it spends the first — so a payer whose funds sit on a later
   * address watches every payment fail for want of money that is plainly there,
   * with only chain-level errors ("No UTXOs available") to go on.
   */
  describe("choosing which address pays", () => {
    const ACCOUNTS = [
      { chain: "POL", address: "0xFirstAddressWithNothingInIt", tokens: ["USDC"] },
      { chain: "POL", address: "0xSecondAddressHoldingTheMoney", tokens: ["USDC"] },
    ];

    it("sends the chosen address through as `from`", async () => {
      const wallet = installWallet({
        connect: vi.fn(async () => ({ accounts: ACCOUNTS })),
      });
      render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
      await openConfirmation();

      const select = await screen.findByRole("combobox");
      fireEvent.change(select, { target: { value: "0xSecondAddressHoldingTheMoney" } });
      fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

      await waitFor(() => expect(wallet.payBatch).toHaveBeenCalled());
      const [, options] = wallet.payBatch.mock.calls[0] as [unknown, { from?: string }];
      expect(options.from).toBe("0xSecondAddressHoldingTheMoney");
    });

    it("leaves `from` unset when the payer does not choose", async () => {
      // Omitted rather than empty: an older extension should behave exactly as
      // it did before, not receive a blank address to interpret.
      const wallet = installWallet({
        connect: vi.fn(async () => ({ accounts: ACCOUNTS })),
      });
      render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
      await openConfirmation();
      await screen.findByRole("combobox");

      fireEvent.click(screen.getByRole("button", { name: /Approve in wallet/ }));

      await waitFor(() => expect(wallet.payBatch).toHaveBeenCalled());
      const [, options] = wallet.payBatch.mock.calls[0] as [unknown, { from?: string }];
      expect(options.from).toBeUndefined();
    });

    it("offers no picker when the wallet has one address", async () => {
      const wallet = installWallet({
        connect: vi.fn(async () => ({ accounts: [ACCOUNTS[0]] })),
      });
      render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
      await openConfirmation();

      await waitFor(() => expect(wallet.connect).toHaveBeenCalled());
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("keeps the run approvable when the address list cannot be read", async () => {
      // Choosing an address is a convenience. If the list cannot be fetched the
      // panel drops the picker and carries on — it must not strand the payer on
      // a confirmation screen they can no longer act on.
      const wallet = installWallet({
        connect: vi.fn(async () => {
          throw new Error("locked");
        }),
      });
      render(<BulkPayAccepted invoices={payable(INVOICE_IDS)} totalUsd={100} />);
      await openConfirmation();

      await waitFor(() => expect(wallet.connect).toHaveBeenCalled());
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Approve in wallet/ })).toBeEnabled();
    });
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

  it("pays cheapest first, and lets you flip to largest first", async () => {
    // Not cosmetic: a wallet that runs dry part-way through settles the most
    // invoices when the small ones go first, so the chosen order has to reach
    // the prepare call — not just the list on screen.
    installWallet();
    const invoices = [
      { id: "inv-big", label: "Big", amountUsd: 90, payeeId: "w1", payeeName: "Ada" },
      { id: "inv-small", label: "Small", amountUsd: 1, payeeId: "w2", payeeName: "Grace" },
      { id: "inv-mid", label: "Mid", amountUsd: 20, payeeId: "w1", payeeName: "Ada" },
    ];
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

    render(<BulkPayAccepted invoices={invoices} totalUsd={111} />);
    fireEvent.click(screen.getByRole("button", { name: /Pay 3/ }));
    await screen.findByRole("button", { name: /Approve in wallet/ });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).invoice_ids).toEqual([
      "inv-small",
      "inv-mid",
      "inv-big",
    ]);

    // Flipping the toggle reverses what the wallet is handed.
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    fireEvent.click(screen.getByRole("button", { name: /largest first/i }));
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Pay 3/ }));
    await screen.findByRole("button", { name: /Approve in wallet/ });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).invoice_ids).toEqual([
      "inv-big",
      "inv-mid",
      "inv-small",
    ]);
  });

  it("shows the quoted crypto amount beside the dollar figure", async () => {
    installWallet();
    render(
      <BulkPayAccepted
        invoices={[
          { id: "a", label: "Worker A", amountUsd: 1, payeeId: "w1", payeeName: "Ada", currency: "usdc_sol", amountCrypto: "0.0138508" },
          // No quote minted yet — a currency with no amount would imply a live
          // price we do not have, so the row stays fiat-only.
          { id: "b", label: "Worker B", amountUsd: 2, payeeId: "w2", payeeName: "Grace", currency: "sol", amountCrypto: null },
        ]}
        totalUsd={3}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Show 2 invoices/ }));

    expect(screen.getByText("0.013851 USDC")).toBeInTheDocument();
    expect(screen.getByText("$1.00")).toBeInTheDocument();
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.queryByText(/ SOL$/)).not.toBeInTheDocument();
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

/**
 * Paying everyone at once is the default, but settling up with a single agent
 * — or in a single coin — should not mean unticking seventy-nine boxes.
 */
describe("BulkPayAccepted — filtering", () => {
  const MIXED = [
    { id: "a1", label: "Ada — Fix login", amountUsd: 10, payeeId: "ada", payeeName: "Ada", currency: "usdc_sol", amountCrypto: null },
    { id: "a2", label: "Ada — Ship compiler", amountUsd: 20, payeeId: "ada", payeeName: "Ada", currency: "sol", amountCrypto: null },
    { id: "g1", label: "Grace — Debug", amountUsd: 30, payeeId: "grace", payeeName: "Grace", currency: "usdc_sol", amountCrypto: null },
  ];

  beforeEach(() => {
    mockFetch();
    installWallet();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (window as any).coinpay;
  });

  it("selects everyone by default, so paying all of it stays one click", () => {
    render(<BulkPayAccepted invoices={MIXED} totalUsd={60} />);

    expect(screen.getByRole("button", { name: /Pay 3/ })).toBeInTheDocument();
    expect(screen.getByText(/3 of 3 selected/)).toBeInTheDocument();
  });

  it("narrows the payment to one agent when that agent is picked", () => {
    render(<BulkPayAccepted invoices={MIXED} totalUsd={60} />);

    fireEvent.change(screen.getByLabelText(/Filter invoices by who gets paid/), {
      target: { value: "ada" },
    });

    // Ada has two invoices worth $30 — Grace's $30 must not be in the run.
    expect(screen.getByRole("button", { name: /Pay 2/ })).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 selected/)).toBeInTheDocument();
  });

  it("narrows to a single coin", () => {
    render(<BulkPayAccepted invoices={MIXED} totalUsd={60} />);

    fireEvent.change(screen.getByLabelText(/Filter invoices by coin/), {
      target: { value: "usdc_sol" },
    });

    expect(screen.getByRole("button", { name: /Pay 2/ })).toBeInTheDocument();
  });

  it("combines the two filters", () => {
    render(<BulkPayAccepted invoices={MIXED} totalUsd={60} />);

    fireEvent.change(screen.getByLabelText(/Filter invoices by who gets paid/), {
      target: { value: "ada" },
    });
    fireEvent.change(screen.getByLabelText(/Filter invoices by coin/), {
      target: { value: "sol" },
    });

    // Only Ada's SOL invoice survives both.
    expect(screen.getByRole("button", { name: /Pay 1/ })).toBeInTheDocument();
  });

  it("restores everyone when the filters are cleared", () => {
    render(<BulkPayAccepted invoices={MIXED} totalUsd={60} />);

    fireEvent.change(screen.getByLabelText(/Filter invoices by who gets paid/), {
      target: { value: "ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));

    expect(screen.getByRole("button", { name: /Pay 3/ })).toBeInTheDocument();
  });

  it("keeps select-all scoped to the filtered rows, never paying a hidden one", () => {
    render(<BulkPayAccepted invoices={MIXED} totalUsd={60} />);

    fireEvent.change(screen.getByLabelText(/Filter invoices by who gets paid/), {
      target: { value: "ada" },
    });
    // Untick, then re-tick: the toggle must not reach across the filter and
    // pull Grace's invoice into a run the payer is not looking at.
    fireEvent.click(screen.getByLabelText(/Deselect all invoices/));
    expect(screen.getByText(/0 of 3 selected/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Select all invoices/));
    expect(screen.getByRole("button", { name: /Pay 2/ })).toBeInTheDocument();
  });

  it("hides the filter bar when there is only one payee and one coin", () => {
    render(
      <BulkPayAccepted
        invoices={[MIXED[0]!]}
        totalUsd={10}
      />
    );

    expect(screen.queryByLabelText(/Filter invoices by who gets paid/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Filter invoices by coin/)).not.toBeInTheDocument();
  });
});
