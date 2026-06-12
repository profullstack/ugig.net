"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  DollarSign,
  Send,
  Link as LinkIcon,
  RefreshCw,
} from "lucide-react";
import { CryptoPaymentBox } from "@/components/payments/CryptoPaymentBox";
import { isGitHubPrLink } from "@/lib/github-links";

interface CoinPayWalletOption {
  currency: string;
  cryptocurrency?: string | null;
  label?: string | null;
  address: string;
}

const shortAddress = (value: string) =>
  value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;

function walletKey(wallet: CoinPayWalletOption) {
  return `${wallet.currency}:${wallet.address}`;
}

function walletLabel(wallet: CoinPayWalletOption) {
  const coin = wallet.cryptocurrency || wallet.currency;
  const label = wallet.label ? `${wallet.label} - ` : "";
  return `${label}${coin.toUpperCase()} (${shortAddress(wallet.address)})`;
}

// Does this wallet pay out in the gig/bounty's stated coin? Matches a native
// coin (SOL, ETH, BTC, POL, USDC, USDT…) or a rail-specific currency key whose
// base is that coin (e.g. gig coin "USDC" → the worker's "usdc_sol" wallet).
function walletMatchesCoin(wallet: CoinPayWalletOption, coin?: string | null) {
  const want = (coin || "").trim().toUpperCase();
  if (!want) return false;
  const cc = (wallet.cryptocurrency || "").toUpperCase();
  const cur = (wallet.currency || "").toUpperCase();
  return cc === want || cur === want || cur.startsWith(`${want}_`);
}

interface GigInvoice {
  id: string;
  amount_usd: number;
  currency: string;
  status: string;
  pay_url: string | null;
  notes: string | null;
  due_date: string | null;
  created_at: string;
  metadata?: {
    payment_address?: string | null;
    amount_crypto?: number | string | null;
    payment_currency?: string | null;
    receiver_payment_currency?: string | null;
    merchant_wallet_address?: string | null;
    merchant_wallet_label?: string | null;
    checkout_url?: string | null;
    expires_at?: string | null;
    replacement_requested_at?: string | null;
    pr_links?: string[] | null;
  } | null;
  worker?: { id: string; username: string; full_name?: string };
  poster?: { id: string; username: string; full_name?: string };
}

interface InvoiceButtonProps {
  gigId: string;
  applicationId: string;
  currentUserId: string;
  isPoster: boolean;
  isWorker: boolean;
  /** The agreed amount in the posting's native unit (sats for SATS/LN/BTC gigs,
   * USD otherwise). Pre-fills the invoice and, for fixed-price gigs, caps it. */
  budgetAmount: number | null;
  /** The gig/bounty's stated payment coin (e.g. "SOL"); used to pre-select the
   * worker's matching CoinPay receiving wallet. */
  gigPaymentCoin?: string | null;
  /** The gig's budget_type; the amount cap only applies to fixed-price gigs. */
  gigBudgetType?: string | null;
}

// Sats-denominated coins price the posting in sats, not USD.
const SATS_COINS = ["SATS", "LN", "BTC"];
const coinIsSats = (coin?: string | null) =>
  SATS_COINS.includes((coin || "").trim().toUpperCase());

export function InvoiceButton({
  gigId,
  applicationId,
  currentUserId,
  isPoster,
  isWorker,
  budgetAmount,
  gigPaymentCoin,
  gigBudgetType,
}: InvoiceButtonProps) {
  const isSats = coinIsSats(gigPaymentCoin);
  // The cap applies to single-payout gigs (fixed and bounty); hourly/per-task
  // totals can legitimately exceed the single quoted rate.
  const bt = gigBudgetType || "fixed";
  const capAmount =
    (bt === "fixed" || bt === "bounty") && budgetAmount ? budgetAmount : null;
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [invoices, setInvoices] = useState<GigInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [walletErrorInvoiceId, setWalletErrorInvoiceId] = useState<string | null>(null);
  const [requestingNewId, setRequestingNewId] = useState<string | null>(null);
  const [requestedNewIds, setRequestedNewIds] = useState<string[]>([]);
  const [wallets, setWallets] = useState<CoinPayWalletOption[]>([]);
  const [selectedWalletKey, setSelectedWalletKey] = useState("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletsLoaded, setWalletsLoaded] = useState(false);
  const [oauthRequired, setOauthRequired] = useState(false);
  const [walletInstructions, setWalletInstructions] = useState<string[]>([]);
  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: "1", unit_price: budgetAmount ? budgetAmount.toString() : "", link: "" },
  ]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  // Optional GitHub PR links, one per line; parsed into an array on submit.
  const [prLinksText, setPrLinksText] = useState("");

  // Fetch existing invoices
  useEffect(() => {
    fetch(`/api/gigs/${gigId}/invoice`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          // Filter to this application's invoices
          const appInvoices = d.data.filter((inv: any) => inv.application_id === applicationId);
          setInvoices(appInvoices);
          // Persisted "replacement requested" flag so the state survives reloads.
          setRequestedNewIds(
            appInvoices
              .filter((inv: any) => inv.metadata?.replacement_requested_at)
              .map((inv: any) => inv.id)
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gigId, applicationId]);

  const loadCoinpayWallets = useCallback(async () => {
    setWalletsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/coinpay/wallets", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to load CoinPay wallets");
        return;
      }
      const nextWallets = Array.isArray(result.data?.wallets) ? result.data.wallets : [];
      setWallets(nextWallets);
      // Default to the wallet matching the gig/bounty's payment coin (most gigs
      // are SOL), falling back to the first wallet if the worker has none for it.
      const preferred =
        nextWallets.find((w: CoinPayWalletOption) => walletMatchesCoin(w, gigPaymentCoin)) ||
        nextWallets[0];
      setSelectedWalletKey(preferred ? walletKey(preferred) : "");
      setOauthRequired(Boolean(result.data?.oauth_required));
      setWalletInstructions(
        Array.isArray(result.data?.setup_instructions) ? result.data.setup_instructions : []
      );
      setWalletsLoaded(true);
    } catch {
      setError("Failed to load CoinPay wallets");
    } finally {
      setWalletsLoaded(true);
      setWalletsLoading(false);
    }
  }, [gigPaymentCoin]);

  useEffect(() => {
    if (showForm && isWorker && !walletsLoaded && !walletsLoading) {
      void loadCoinpayWallets();
    }
  }, [loadCoinpayWallets, showForm, isWorker, walletsLoaded, walletsLoading]);

  const handleCreateInvoice = async () => {
    const lineItems = items
      .map((it) => ({
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price),
        link: it.link.trim() || undefined,
      }))
      .filter((it) => Number.isFinite(it.unit_price) && it.unit_price > 0);
    if (lineItems.length === 0) {
      setError("Add at least one line item with a unit price");
      return;
    }
    const badItemLink = lineItems.find((it) => it.link && !isGitHubPrLink(it.link));
    if (badItemLink) {
      setError(`Not a GitHub PR or PR search link: ${badItemLink.link}`);
      return;
    }
    const total = Math.round(
      lineItems.reduce((s, it) => s + it.quantity * it.unit_price, 0) * 100
    ) / 100;

    if (capAmount != null && total > capAmount + 1e-6) {
      const fmt = (n: number) =>
        isSats ? `${n.toLocaleString()} sats` : `$${n.toFixed(2)}`;
      setError(`Invoice total (${fmt(total)}) can't exceed the agreed amount (${fmt(capAmount)}).`);
      return;
    }

    // Split the textarea into one link per line/comma and validate each looks
    // like a GitHub PR URL (matches the server's check) before sending.
    const prLinks = prLinksText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const badLink = prLinks.find((u) => !isGitHubPrLink(u));
    if (badLink) {
      setError(`Not a GitHub pull request link: ${badLink}`);
      return;
    }

    setIsCreating(true);
    setError(null);
    const selectedWallet =
      wallets.find((wallet) => walletKey(wallet) === selectedWalletKey) || null;
    if (!selectedWallet) {
      setError("Select a CoinPay receiving wallet");
      setIsCreating(false);
      return;
    }

    try {
      const response = await fetch(`/api/gigs/${gigId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          items: lineItems,
          amount: total,
          currency: "USD",
          payment_currency: selectedWallet.currency,
          merchant_wallet_address: selectedWallet.address,
          notes: notes || undefined,
          due_date: dueDate || undefined,
          pr_links: prLinks.length > 0 ? prLinks : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to create invoice");
        return;
      }

      // Add to local list
      setInvoices((prev) => [
        {
          id: result.data.invoice_id,
          amount_usd: total,
          currency: "USD",
          status: "sent",
          pay_url: result.data.pay_url,
          notes: notes || null,
          due_date: dueDate || null,
          created_at: new Date().toISOString(),
          metadata: result.data.metadata || {
            payment_address: result.data.payment_address,
            amount_crypto: result.data.amount_crypto,
            payment_currency: result.data.payment_currency,
            receiver_payment_currency: result.data.metadata?.receiver_payment_currency,
            merchant_wallet_address: result.data.metadata?.merchant_wallet_address,
            merchant_wallet_label: result.data.metadata?.merchant_wallet_label,
            expires_at: result.data.expires_at,
          },
        },
        ...prev,
      ]);
      setShowForm(false);
      setItems([{ description: "", quantity: "1", unit_price: "", link: "" }]);
      setNotes("");
      setDueDate("");
      setPrLinksText("");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreatePaymentRequest = async (invoiceId: string) => {
    setPayingInvoiceId(invoiceId);
    setError(null);
    setWalletErrorInvoiceId(null);

    try {
      const response = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (!response.ok) {
        const message = result.error || "Failed to create payment request";
        setError(message);
        // The worker's CoinPay wallet is missing or no longer connected. Let the
        // poster ask them for a fresh invoice instead of leaving a dead end.
        if (/wallet|coinpay|not connected|receiving/i.test(message)) {
          setWalletErrorInvoiceId(invoiceId);
        }
        return;
      }

      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                status: "sent",
                pay_url: result.data?.pay_url || null,
                metadata: result.data?.metadata || {
                  payment_address: result.data?.payment_address,
                  amount_crypto: result.data?.amount_crypto,
                  payment_currency: result.data?.payment_currency,
                  expires_at: result.data?.expires_at,
                },
              }
            : inv
        )
      );
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const handleRequestNewInvoice = async (invoiceId: string) => {
    setRequestingNewId(invoiceId);
    setError(null);

    try {
      const response = await fetch(`/api/gigs/${gigId}/invoice/${invoiceId}/request-new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to request a new invoice");
        return;
      }

      setRequestedNewIds((prev) => [...prev, invoiceId]);
      setWalletErrorInvoiceId(null);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setRequestingNewId(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> Draft
          </Badge>
        );
      case "sent":
        return (
          <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
            <Send className="h-3 w-3" /> Sent
          </Badge>
        );
      case "paid":
        return (
          <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="h-3 w-3" /> Paid
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1">
            Cancelled
          </Badge>
        );
      case "expired":
        return (
          <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
            <Send className="h-3 w-3" /> Awaiting payment
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading invoices...
      </div>
    );
  }

  // Show existing invoices
  if (invoices.length > 0) {
    return (
      <div className="space-y-3">
        {invoices.map((inv) => (
          <div key={inv.id} className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">${inv.amount_usd}</span>
                <span className="text-sm text-muted-foreground">{inv.currency}</span>
              </div>
              {statusBadge(inv.status)}
            </div>

            {inv.notes && <p className="text-sm text-muted-foreground">{inv.notes}</p>}

            {inv.metadata?.pr_links && inv.metadata.pr_links.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Merged PRs</p>
                <ul className="space-y-0.5">
                  {inv.metadata.pr_links.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline break-all"
                      >
                        <LinkIcon className="h-3 w-3 shrink-0" />
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Poster: keep payment UX inside uGig. */}
            {isPoster && inv.status === "sent" && inv.metadata?.payment_address && (
              <CryptoPaymentBox
                title="Invoice payment"
                paymentAddress={inv.metadata.payment_address || ""}
                amountCrypto={inv.metadata.amount_crypto}
                paymentCurrency={inv.metadata.payment_currency}
                expiresAt={inv.metadata.expires_at}
                compact
              />
            )}

            {isPoster &&
              (inv.status === "expired" ||
                (inv.status === "sent" && !inv.metadata?.payment_address)) && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Pay when you are ready. The crypto amount will be quoted for the worker-selected
                    CoinPay wallet.
                  </p>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  {walletErrorInvoiceId === inv.id && (
                    <p className="text-xs text-muted-foreground">
                      The worker&apos;s CoinPay wallet isn&apos;t connected, so this invoice
                      can&apos;t be paid. Ask them to send a fresh invoice with a connected wallet.
                    </p>
                  )}
                  {requestedNewIds.includes(inv.id) && (
                    <p className="text-sm text-green-600">
                      We asked the worker to send a fresh invoice. You&apos;ll be notified when it
                      arrives.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleCreatePaymentRequest(inv.id)}
                      disabled={payingInvoiceId === inv.id || requestingNewId === inv.id}
                      className="gap-2"
                    >
                      {payingInvoiceId === inv.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <DollarSign className="h-4 w-4" />
                      )}
                      Pay now
                    </Button>
                    {walletErrorInvoiceId === inv.id && !requestedNewIds.includes(inv.id) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRequestNewInvoice(inv.id)}
                        disabled={requestingNewId === inv.id}
                        className="gap-2"
                      >
                        {requestingNewId === inv.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Request a new invoice
                      </Button>
                    )}
                  </div>
                </div>
              )}

            {/* Worker: show pay link status */}
            {isWorker && inv.status === "sent" && (
              <p className="text-sm text-blue-600">
                📧 Invoice sent to client. Waiting for payment.
              </p>
            )}

            {inv.status === "paid" && <p className="text-sm text-green-600">✅ Invoice paid!</p>}
          </div>
        ))}

        {/* Worker can send another invoice */}
        {isWorker && !showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2">
            <FileText className="h-4 w-4" />
            Send Another Invoice
          </Button>
        )}

        {isWorker && showForm && (
          <InvoiceForm
            isSats={isSats}
            capAmount={capAmount}
            items={items}
            setItems={setItems}
            notes={notes}
            setNotes={setNotes}
            dueDate={dueDate}
            setDueDate={setDueDate}
            prLinksText={prLinksText}
            setPrLinksText={setPrLinksText}
            error={error}
            isCreating={isCreating}
            wallets={wallets}
            selectedWalletKey={selectedWalletKey}
            setSelectedWalletKey={setSelectedWalletKey}
            walletsLoading={walletsLoading}
            oauthRequired={oauthRequired}
            walletInstructions={walletInstructions}
            onRefreshWallets={loadCoinpayWallets}
            onSubmit={handleCreateInvoice}
            onCancel={() => {
              setShowForm(false);
              setError(null);
            }}
          />
        )}
      </div>
    );
  }

  // Worker: show create invoice button/form
  if (isWorker) {
    if (showForm) {
      return (
        <InvoiceForm
          isSats={isSats}
          capAmount={capAmount}
          items={items}
          setItems={setItems}
          notes={notes}
          setNotes={setNotes}
          dueDate={dueDate}
          setDueDate={setDueDate}
          prLinksText={prLinksText}
          setPrLinksText={setPrLinksText}
          error={error}
          isCreating={isCreating}
          wallets={wallets}
          selectedWalletKey={selectedWalletKey}
          setSelectedWalletKey={setSelectedWalletKey}
          walletsLoading={walletsLoading}
          oauthRequired={oauthRequired}
          walletInstructions={walletInstructions}
          onRefreshWallets={loadCoinpayWallets}
          onSubmit={handleCreateInvoice}
          onCancel={() => {
            setShowForm(false);
            setError(null);
          }}
        />
      );
    }

    return (
      <Button onClick={() => setShowForm(true)} variant="default" className="gap-2">
        <FileText className="h-4 w-4" />
        Send Invoice
        {budgetAmount
          ? isSats
            ? ` (${budgetAmount.toLocaleString()} sats)`
            : ` ($${budgetAmount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })})`
          : ""}
      </Button>
    );
  }

  // Poster with no invoices yet: nothing to show
  return null;
}

// ── Invoice Form ──

type LineItem = { description: string; quantity: string; unit_price: string; link: string };

function InvoiceForm({
  isSats,
  capAmount,
  items,
  setItems,
  notes,
  setNotes,
  dueDate,
  setDueDate,
  prLinksText,
  setPrLinksText,
  error,
  isCreating,
  wallets,
  selectedWalletKey,
  setSelectedWalletKey,
  walletsLoading,
  oauthRequired,
  walletInstructions,
  onRefreshWallets,
  onSubmit,
  onCancel,
}: {
  isSats: boolean;
  capAmount: number | null;
  items: LineItem[];
  setItems: (v: LineItem[]) => void;
  notes: string;
  setNotes: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  prLinksText: string;
  setPrLinksText: (v: string) => void;
  error: string | null;
  isCreating: boolean;
  wallets: CoinPayWalletOption[];
  selectedWalletKey: string;
  setSelectedWalletKey: (v: string) => void;
  walletsLoading: boolean;
  oauthRequired: boolean;
  walletInstructions: string[];
  onRefreshWallets: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const hasWallets = wallets.length > 0;
  const total = items.reduce((s, it) => {
    const qty = parseFloat(it.quantity) || 1;
    const price = parseFloat(it.unit_price) || 0;
    return s + qty * price;
  }, 0);
  const overCap = capAmount != null && total > capAmount + 1e-6;
  const fmtAmount = (n: number) =>
    isSats ? `${n.toLocaleString()} sats` : `$${n.toFixed(2)}`;
  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems([...items, { description: "", quantity: "1", unit_price: "", link: "" }]);
  const removeItem = (i: number) =>
    setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items);

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="font-medium text-sm">Create Invoice</p>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Charges</label>
        {items.map((item, i) => {
          const qty = parseFloat(item.quantity) || 1;
          const price = parseFloat(item.unit_price) || 0;
          const lineTotal = qty * price;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  placeholder="Description (e.g. PRs merged)"
                  className="flex-1 text-sm border rounded-md px-2 py-1.5 bg-background"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(i)}
                  disabled={items.length <= 1}
                  className="h-8 px-2 text-muted-foreground shrink-0"
                  aria-label="Remove line item"
                >
                  ✕
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-0">
                {/* Quantity */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <span>Qty</span>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, { quantity: e.target.value })}
                    placeholder="1"
                    min="0.001"
                    step="1"
                    className="w-16 text-sm border rounded-md px-2 py-1 bg-background"
                  />
                </div>
                <span className="text-xs text-muted-foreground">×</span>
                {/* Unit price */}
                <div className="relative shrink-0">
                  {!isSats && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $
                    </span>
                  )}
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={(e) => updateItem(i, { unit_price: e.target.value })}
                    placeholder={isSats ? "0" : "0.00"}
                    min={isSats ? "1" : "0.01"}
                    step={isSats ? "1" : "0.01"}
                    className={`w-24 text-sm border rounded-md py-1 bg-background ${
                      isSats ? "pl-2 pr-8" : "pl-5 pr-2"
                    }`}
                  />
                  {isSats && (
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      sats
                    </span>
                  )}
                </div>
                {/* Line total */}
                {lineTotal > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    = {fmtAmount(lineTotal)}
                  </span>
                )}
              </div>
              <input
                type="url"
                value={item.link}
                onChange={(e) => updateItem(i, { link: e.target.value })}
                placeholder="Link to merged PRs (optional) — e.g. https://github.com/org/repo/pulls?q=is:pr+is:merged+author:you"
                className="w-full text-xs border rounded-md px-2 py-1 bg-background"
              />
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addItem}
            className="h-7 px-2 text-xs"
          >
            + Add line item
          </Button>
          <span className="text-sm">
            Total{" "}
            <span
              className={`font-semibold tabular-nums ${overCap ? "text-destructive" : ""}`}
            >
              {fmtAmount(total)}
            </span>
          </span>
        </div>
        {capAmount != null && (
          <p className={`text-xs ${overCap ? "text-destructive" : "text-muted-foreground"}`}>
            {overCap
              ? `Over the agreed amount (${fmtAmount(capAmount)}). Lower the total to send.`
              : `Agreed amount for this gig: ${fmtAmount(capAmount)}.`}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Description of work completed..."
          rows={2}
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background resize-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Merged PR links (optional)
        </label>
        <textarea
          value={prLinksText}
          onChange={(e) => setPrLinksText(e.target.value)}
          placeholder="https://github.com/org/repo/pull/123 (one per line)"
          rows={2}
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Paste the GitHub pull requests merged for this work, one per line. A PR search URL
          (github.com/org/repo/pulls?q=…) also works.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Due Date (optional)</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
        />
      </div>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            CoinPay receiving wallet
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefreshWallets}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        {walletsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading CoinPay wallets...
          </div>
        ) : hasWallets ? (
          <>
            <select
              value={selectedWalletKey}
              onChange={(event) => setSelectedWalletKey(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {wallets.map((wallet) => (
                <option key={walletKey(wallet)} value={walletKey(wallet)}>
                  {walletLabel(wallet)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The poster will pay the generated CoinPay amount on the coin rail for this wallet.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Connect CoinPay and add global wallet addresses before sending an invoice.
            </p>
            {walletInstructions.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                {walletInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>
            )}
            {oauthRequired && (
              <Link
                href="/settings/connections"
                className={buttonVariants({ size: "sm", className: "gap-2" })}
              >
                <LinkIcon className="h-4 w-4" />
                Connect CoinPay
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button
          onClick={onSubmit}
          disabled={isCreating || total <= 0 || overCap || !hasWallets}
          className="flex-1"
          size="sm"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send Invoice
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
