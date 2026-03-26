"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Zap, ArrowDownToLine, ArrowUpFromLine, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/components/providers/DialogProvider";
import { SatsAmount, SatsFiatHint } from "@/components/ui/SatsAmount";

interface Transaction {
  id: string;
  type: string;
  amount_sats: number;
  balance_after: number;
  status: string;
  created_at: string;
}

const DEPOSIT_AMOUNTS = [1000, 5000, 10000, 50000];

function WithdrawSection({ balance, onWithdraw }: { balance: number; onWithdraw: (newBal: number) => void }) {
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleWithdraw() {
    const sats = parseInt(amount);
    if (!sats || sats <= 0 || !destination) return;

    setWithdrawing(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_sats: sats, destination }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Withdrawal failed");
        setWithdrawing(false);
        return;
      }

      setSuccess(true);
      onWithdraw(data.new_balance);
      setAmount("");
      setDestination("");
    } catch {
      setError("Withdrawal failed. Please try again.");
    }
    setWithdrawing(false);
  }

  return (
    <div className="border border-border rounded-lg p-6 mb-6 bg-card">
      <h2 className="font-semibold mb-3 flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4" /> Withdraw</h2>

      {success ? (
        <div className="text-center py-4">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-green-500 font-semibold">Withdrawal sent!</p>
          <p className="text-sm text-muted-foreground mt-1">Sats are on their way.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setSuccess(false)}>Withdraw more</Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">Withdraw sats to any Lightning Address or paste a bolt11 invoice.</p>

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Lightning Address (user@wallet.com) or bolt11 invoice"
              value={destination}
              onChange={(e) => setDestination(e.target.value.trim())}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount (sats)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                min={10}
                max={balance}
              />
              <Button
                size="sm"
                disabled={withdrawing || !amount || !destination || parseInt(amount) > balance || parseInt(amount) < 10}
                onClick={handleWithdraw}
              >
                {withdrawing ? "Sending..." : "Withdraw"}
              </Button>
            </div>
            {amount && parseInt(amount) > 0 && (
              <p className="text-xs text-amber-500"><SatsAmount sats={parseInt(amount)} /></p>
            )}
            <p className="text-xs text-muted-foreground">Min: 10 sats · Max: {Math.min(balance, 100000).toLocaleString()} sats · Available: <SatsAmount sats={balance} /></p>
          </div>
        </>
      )}
    </div>
  );
}

export default function WalletPage() {
  const { alert } = useDialog();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [invoice, setInvoice] = useState<{ payment_request: string; payment_hash: string; amount_sats: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refreshTransactions = useCallback(async () => {
    const t = await fetch("/api/wallet/transactions").then((r) => r.json());
    setTransactions(t.transactions ?? []);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/wallet/balance").then((r) => r.json()),
      fetch("/api/wallet/transactions").then((r) => r.json()),
    ]).then(([b, t]) => {
      setBalance(b.balance_sats ?? 0);
      setTransactions(t.transactions ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleDeposit(amount: number) {
    if (amount <= 0) return;
    setDepositing(true);
    setPaid(false);
    setInvoice(null);

    try {
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_sats: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        await alert(data.error || "Failed to create invoice");
        setDepositing(false);
        return;
      }

      setInvoice({ payment_request: data.payment_request, payment_hash: data.payment_hash, amount_sats: amount });
      setDepositing(false);

      // Poll for payment
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const checkRes = await fetch(`/api/wallet/deposit/check?payment_hash=${data.payment_hash}`);
          const checkData = await checkRes.json();
          if (checkData.paid && mountedRef.current) {
            setPaid(true);
            setBalance(checkData.balance_sats);
            if (pollRef.current) clearInterval(pollRef.current);
            refreshTransactions();
          }
        } catch {
          // ignore poll errors
        }
      }, 3000);
    } catch {
      await alert("Failed to create invoice");
      setDepositing(false);
    }
  }

  function copyInvoice() {
    if (invoice) {
      navigator.clipboard.writeText(invoice.payment_request);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function cancelInvoice() {
    if (pollRef.current) clearInterval(pollRef.current);
    setInvoice(null);
    setPaid(false);
  }

  const typeLabel: Record<string, string> = { deposit: "Deposit", withdrawal: "Withdrawal", withdraw: "Withdrawal", zap_sent: "Zap Sent", zap_received: "Zap Received" };
  const typeColor: Record<string, string> = { deposit: "text-green-500", withdrawal: "text-red-500", withdraw: "text-red-500", zap_sent: "text-red-400", zap_received: "text-green-400" };

  if (loading) {
    return <div className="container mx-auto px-4 py-8 max-w-5xl"><p className="text-muted-foreground">Loading wallet...</p></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Zap className="h-6 w-6 text-amber-500 fill-amber-500" /> Wallet
      </h1>

      {/* Balance */}
      <div className="border border-border rounded-lg p-6 mb-6 bg-card">
        <div className="text-sm text-muted-foreground mb-1">Balance</div>
        <div className="text-3xl font-bold text-amber-500 flex items-center gap-2">
          <Zap className="h-7 w-7 fill-amber-500" /> <SatsAmount sats={balance} />
        </div>
        <button
          className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
          onClick={async () => {
            const res = await fetch("/api/wallet/sync", { method: "POST" });
            const data = await res.json();
            if (data.balance_sats !== undefined) {
              setBalance(data.balance_sats);
              refreshTransactions();
              await alert(`Synced ${data.synced} payment(s), +${data.credited_sats} sats`);
            } else {
              refreshTransactions();
              await alert(data.message || "Already in sync");
            }
          }}
        >
          Sync missing payments from Lightning
        </button>
      </div>

      {/* Deposit */}
      <div className="border border-border rounded-lg p-6 mb-6 bg-card">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Deposit via Lightning</h2>

        {!invoice && !paid && (
          <>
            <p className="text-sm text-muted-foreground mb-3">Select an amount or enter a custom one to generate a Lightning invoice.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {DEPOSIT_AMOUNTS.map((amt) => (
                <Button key={amt} variant="outline" size="sm" disabled={depositing} onClick={() => handleDeposit(amt)}>
                  <SatsAmount sats={amt} />
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                min={1}
                max={1000000}
              />
              <Button size="sm" disabled={depositing || !customAmount} onClick={() => handleDeposit(parseInt(customAmount))}>
                {depositing ? "Creating..." : "Deposit"}
              </Button>
            </div>
            {customAmount && parseInt(customAmount) > 0 && (
              <p className="text-xs text-amber-500"><SatsAmount sats={parseInt(customAmount)} /></p>
            )}
          </>
        )}

        {invoice && !paid && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Pay this Lightning invoice for <strong><SatsAmount sats={invoice.amount_sats} /></strong>:</p>
            <div className="flex justify-center bg-white rounded-lg p-4">
              <img
                alt="Lightning invoice QR code"
                className="h-[220px] w-[220px]"
                height={220}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(invoice.payment_request)}`}
                width={220}
              />
            </div>
            <div className="relative">
              <div className="bg-muted rounded-md p-3 text-xs font-mono break-all max-h-24 overflow-y-auto">
                {invoice.payment_request}
              </div>
              <button onClick={copyInvoice} className="absolute top-2 right-2 p-1 rounded bg-background border border-border hover:bg-muted" title="Copy">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground animate-pulse">⏳ Waiting for payment...</p>
              <Button variant="ghost" size="sm" onClick={cancelInvoice}>Cancel</Button>
            </div>
          </div>
        )}

        {paid && (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-green-500 font-semibold">Payment received!</p>
            <p className="text-sm text-muted-foreground mt-1">Your balance has been updated.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setPaid(false); setInvoice(null); }}>
              Make another deposit
            </Button>
          </div>
        )}
      </div>

      {/* Withdraw */}
      <WithdrawSection balance={balance} onWithdraw={(newBal) => { setBalance(newBal); refreshTransactions(); }} />

      {/* Transactions */}
      <div className="border border-border rounded-lg p-6 bg-card">
        <h2 className="font-semibold mb-3">Transaction History</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <span className={`text-sm font-medium ${typeColor[tx.type] || ""}`}>{typeLabel[tx.type] || tx.type}</span>
                  {tx.status === "pending" && (
                    <button
                      className="text-xs text-yellow-500 ml-1 underline hover:text-yellow-400"
                      onClick={async () => {
                        // Try to resolve pending deposit via LNbits check
                        const res = await fetch("/api/wallet/deposit/resolve", { method: "POST" });
                        const data = await res.json();
                        if (data.resolved) {
                          setBalance(data.balance_sats);
                          refreshTransactions();
                        } else {
                          await alert("Payment not yet received. Try again later.");
                        }
                      }}
                    >
                      (pending - click to check)
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground ml-2">{new Date(tx.created_at).toLocaleDateString()}</span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-medium ${tx.amount_sats >= 0 ? "text-green-500" : "text-red-400"}`}>
                    <SatsAmount sats={tx.amount_sats} sign />
                  </span>
                  <div className="text-xs text-muted-foreground">bal: <SatsAmount sats={tx.balance_after} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
