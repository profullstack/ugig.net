"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/coinpayportal";

interface WalletAddress {
  currency: string;
  address: string;
  is_preferred?: boolean;
}

interface GigEscrow {
  id: string;
  amount_usd: number;
  platform_fee_usd: number;
  currency: string;
  status: string;
  funded_at: string | null;
  released_at: string | null;
  metadata: {
    checkout_url?: string;
    payment_address?: string;
  };
  worker?: { id: string; username: string; full_name?: string };
  poster?: { id: string; username: string; full_name?: string };
}

interface EscrowPaymentButtonProps {
  gigId: string;
  applicationId: string;
  currentUserId: string;
  isPoster: boolean;
  isWorker: boolean;
  budgetAmount: number | null;
  existingEscrow?: GigEscrow | null;
  workerId?: string;
}

export function EscrowPaymentButton({
  gigId,
  applicationId,
  currentUserId,
  isPoster,
  isWorker,
  budgetAmount,
  existingEscrow,
  workerId,
}: EscrowPaymentButtonProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>("usdc_sol");
  const [showCurrencySelect, setShowCurrencySelect] = useState(false);
  const [escrow, setEscrow] = useState<GigEscrow | null>(existingEscrow || null);
  const [posterAddresses, setPosterAddresses] = useState<WalletAddress[]>([]);
  const [workerAddresses, setWorkerAddresses] = useState<WalletAddress[]>([]);
  const [depositorAddress, setDepositorAddress] = useState("");
  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [manualDepositor, setManualDepositor] = useState(false);
  const [manualBeneficiary, setManualBeneficiary] = useState(false);

  // Fetch wallet addresses when currency select opens
  useEffect(() => {
    if (!showCurrencySelect) return;
    const qs = new URLSearchParams();
    if (workerId) qs.set("worker_id", workerId);
    qs.set("gig_id", gigId);

    fetch(`/api/profile/wallet-addresses?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.poster_addresses) setPosterAddresses(d.poster_addresses);
        if (d.worker_addresses) setWorkerAddresses(d.worker_addresses);
      })
      .catch(() => {});
  }, [showCurrencySelect, workerId, gigId]);

  // Map currency to chain for address filtering
  const currencyToChain = (c: string): string => {
    const map: Record<string, string> = {
      usdc_pol: "pol", usdc_sol: "sol", usdc_eth: "eth",
      pol: "pol", sol: "sol", eth: "eth", btc: "btc",
      usdt: "eth",
    };
    return map[c] || c;
  };

  const chain = currencyToChain(selectedCurrency);
  const filteredPosterAddrs = posterAddresses.filter(
    (w) => w.currency.toLowerCase() === chain || w.currency.toLowerCase() === selectedCurrency
  );
  const filteredWorkerAddrs = workerAddresses.filter(
    (w) => w.currency.toLowerCase() === chain || w.currency.toLowerCase() === selectedCurrency
  );

  // Auto-select preferred/first address when currency or addresses change
  useEffect(() => {
    const chainKey = currencyToChain(selectedCurrency);
    const filtered = posterAddresses.filter(
      (w) => w.currency.toLowerCase() === chainKey || w.currency.toLowerCase() === selectedCurrency
    );
    const preferred = filtered.find((w) => w.is_preferred);
    if (preferred) setDepositorAddress(preferred.address);
    else if (filtered.length === 1) setDepositorAddress(filtered[0].address);
    else if (!manualDepositor) setDepositorAddress("");
  }, [selectedCurrency, posterAddresses, manualDepositor]);

  useEffect(() => {
    const chainKey = currencyToChain(selectedCurrency);
    const filtered = workerAddresses.filter(
      (w) => w.currency.toLowerCase() === chainKey || w.currency.toLowerCase() === selectedCurrency
    );
    const preferred = filtered.find((w) => w.is_preferred);
    if (preferred) setBeneficiaryAddress(preferred.address);
    else if (filtered.length === 1) setBeneficiaryAddress(filtered[0].address);
    else if (!manualBeneficiary) setBeneficiaryAddress("");
  }, [selectedCurrency, workerAddresses, manualBeneficiary]);

  const handleCreateEscrow = async () => {
    if (!depositorAddress || !beneficiaryAddress) {
      setError("Both depositor and beneficiary wallet addresses are required.");
      return;
    }
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/gigs/${gigId}/escrow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          currency: selectedCurrency,
          depositor_address: depositorAddress,
          beneficiary_address: beneficiaryAddress,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to create escrow");
        return;
      }

      setEscrow({
        id: result.data.escrow_id,
        amount_usd: result.data.amount_usd,
        platform_fee_usd: result.data.platform_fee_usd,
        currency: result.data.currency,
        status: "pending_payment",
        funded_at: null,
        released_at: null,
        metadata: {
          payment_address: result.data.payment_address,
        },
      });
      setShowCurrencySelect(false);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRelease = async () => {
    if (!escrow) return;
    setIsReleasing(true);
    setError(null);

    try {
      const response = await fetch(`/api/gigs/${gigId}/escrow/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escrow_id: escrow.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to release escrow");
        return;
      }

      setEscrow({ ...escrow, status: "released", released_at: new Date().toISOString() });
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsReleasing(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending_payment":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" /> Awaiting Payment
          </Badge>
        );
      case "funded":
        return (
          <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
            <Shield className="h-3 w-3" /> In Escrow
          </Badge>
        );
      case "released":
        return (
          <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="h-3 w-3" /> Released
          </Badge>
        );
      case "refunded":
        return (
          <Badge variant="secondary" className="gap-1">
            Refunded
          </Badge>
        );
      case "disputed":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Disputed
          </Badge>
        );
      default:
        return null;
    }
  };

  // ── Existing escrow display ──
  if (escrow) {
    return (
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">${escrow.amount_usd}</span>
            <span className="text-sm text-muted-foreground">
              ({SUPPORTED_CURRENCIES[escrow.currency as SupportedCurrency]?.name || escrow.currency})
            </span>
          </div>
          {statusBadge(escrow.status)}
        </div>

        {escrow.platform_fee_usd > 0 && (
          <p className="text-xs text-muted-foreground">
            Platform fee: ${escrow.platform_fee_usd} (5%) · Worker receives: ${escrow.amount_usd - escrow.platform_fee_usd}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Poster: pending → show payment address */}
        {isPoster && escrow.status === "pending_payment" && escrow.metadata?.payment_address && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Send crypto to this escrow address:</p>
            <code className="block text-xs bg-muted p-2 rounded break-all select-all">
              {escrow.metadata.payment_address}
            </code>
          </div>
        )}

        {/* Poster: funded → show release */}
        {isPoster && escrow.status === "funded" && (
          <Button
            onClick={handleRelease}
            disabled={isReleasing}
            className="w-full bg-green-600 hover:bg-green-500"
            size="sm"
          >
            {isReleasing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Release Payment to Worker
          </Button>
        )}

        {/* Worker: show status message */}
        {isWorker && escrow.status === "funded" && (
          <p className="text-sm text-blue-600">
            💰 Payment is secured in escrow. Complete the work and the poster will release it.
          </p>
        )}

        {isWorker && escrow.status === "released" && (
          <p className="text-sm text-green-600">
            ✅ Payment of ${escrow.amount_usd - escrow.platform_fee_usd} has been released to you!
          </p>
        )}
      </div>
    );
  }

  // ── No escrow yet: poster can create ──
  if (!isPoster) return null;

  if (showCurrencySelect) {
    return (
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="font-medium text-sm">Select payment currency</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(SUPPORTED_CURRENCIES) as [SupportedCurrency, { name: string }][]).map(
            ([key, { name }]) => (
              <button
                key={key}
                onClick={() => setSelectedCurrency(key)}
                className={`text-left text-sm px-3 py-2 rounded-md border transition-colors ${
                  selectedCurrency === key
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {name}
              </button>
            )
          )}
        </div>

        {/* Depositor (poster) address */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Your wallet (depositor)
          </label>
          {filteredPosterAddrs.length > 0 && !manualDepositor ? (
            <div className="space-y-1">
              <select
                value={depositorAddress}
                onChange={(e) => setDepositorAddress(e.target.value)}
                className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              >
                <option value="">Select address...</option>
                {filteredPosterAddrs.map((w, i) => (
                  <option key={i} value={w.address}>
                    {w.address.slice(0, 8)}...{w.address.slice(-6)} {w.is_preferred ? "⭐" : ""}
                  </option>
                ))}
              </select>
              <button onClick={() => setManualDepositor(true)} className="text-xs text-primary hover:underline">
                Enter manually
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <input
                type="text"
                value={depositorAddress}
                onChange={(e) => setDepositorAddress(e.target.value)}
                placeholder="Your wallet address"
                className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              />
              {filteredPosterAddrs.length > 0 && (
                <button onClick={() => setManualDepositor(false)} className="text-xs text-primary hover:underline">
                  Choose from saved
                </button>
              )}
            </div>
          )}
        </div>

        {/* Beneficiary (worker) address */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Worker wallet (beneficiary)
          </label>
          {filteredWorkerAddrs.length > 0 && !manualBeneficiary ? (
            <div className="space-y-1">
              <select
                value={beneficiaryAddress}
                onChange={(e) => setBeneficiaryAddress(e.target.value)}
                className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              >
                <option value="">Select address...</option>
                {filteredWorkerAddrs.map((w, i) => (
                  <option key={i} value={w.address}>
                    {w.address.slice(0, 8)}...{w.address.slice(-6)} {w.is_preferred ? "⭐" : ""}
                  </option>
                ))}
              </select>
              <button onClick={() => setManualBeneficiary(true)} className="text-xs text-primary hover:underline">
                Enter manually
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <input
                type="text"
                value={beneficiaryAddress}
                onChange={(e) => setBeneficiaryAddress(e.target.value)}
                placeholder="Worker wallet address"
                className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              />
              {filteredWorkerAddrs.length > 0 && (
                <button onClick={() => setManualBeneficiary(false)} className="text-xs text-primary hover:underline">
                  Choose from saved
                </button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button
            onClick={handleCreateEscrow}
            disabled={isCreating || !depositorAddress || !beneficiaryAddress}
            className="flex-1"
            size="sm"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Fund ${budgetAmount || "?"} Escrow
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCurrencySelect(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      onClick={() => setShowCurrencySelect(true)}
      variant="default"
      className="gap-2"
    >
      <Shield className="h-4 w-4" />
      Fund Escrow{budgetAmount ? ` ($${budgetAmount})` : ""}
    </Button>
  );
}
