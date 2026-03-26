"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const ZAP_AMOUNTS = [1, 2, 5, 10, 20, 50, 100, 1000, 10000];

interface ZapButtonProps {
  targetType: "post" | "gig" | "comment" | "profile" | "skill" | "mcp";
  targetId: string;
  recipientId: string;
  totalSats?: number;
  zapCount?: number;
}

export function ZapButton({ targetType, targetId, recipientId, totalSats: initialTotal = 0, zapCount: initialCount = 0 }: ZapButtonProps) {
  const [open, setOpen] = useState(false);
  const [totalSats, setTotalSats] = useState(initialTotal);
  const [zapCount, setZapCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLnModal, setShowLnModal] = useState(false);
  const [hasLnAddress, setHasLnAddress] = useState<boolean | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    fetch(`/api/zaps?target_type=${targetType}&target_id=${targetId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.total_sats !== undefined) setTotalSats(d.total_sats);
        if (d.zap_count !== undefined) setZapCount(d.zap_count);
      })
      .catch(() => {});
  }, [targetType, targetId]);

  async function checkLnAddress(): Promise<boolean> {
    if (hasLnAddress !== null) return hasLnAddress;
    try {
      const res = await fetch("/api/profile", { method: "GET" });
      if (!res.ok) return false;
      const data = await res.json();
      const has = !!data.profile?.ln_address;
      setHasLnAddress(has);
      return has;
    } catch {
      return false;
    }
  }

  async function handleClick(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    const has = await checkLnAddress();
    if (!has) {
      setShowLnModal(true);
      return;
    }
    setOpen(!open);
  }

  async function handleZap(amount: number) {
    setLoading(true);
    setOpen(false);
    setError(null);
    try {
      const res = await fetch("/api/wallet/zap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: recipientId, amount_sats: amount, target_type: targetType, target_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to zap");
        return;
      }
      setTotalSats((prev) => prev + amount);
      setZapCount((prev) => prev + 1);
      setZapCount((prev) => prev + 1);
      setOpen(false);
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    } catch {
      setError("Failed to zap");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div ref={ref} className="relative inline-flex" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <button
          onClick={(e) => handleClick(e)}
          disabled={loading}
          className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-500 transition-all ${flash ? "text-amber-400 scale-110" : ""} ${loading ? "opacity-50 pointer-events-none" : ""}`}
          title="Zap"
        >
          <Zap className={`h-3.5 w-3.5 ${totalSats > 0 ? "text-amber-500 fill-amber-500" : ""}`} />
          {totalSats > 0 && <span className="text-amber-500 font-medium">{totalSats.toLocaleString()}</span>}
          {zapCount > 0 && <span className="text-muted-foreground">({zapCount})</span>}
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-2 min-w-[160px]">
            <div className="text-xs text-muted-foreground mb-1.5 px-1">Zap sats ⚡</div>
            <div className="flex flex-wrap gap-1">
              {ZAP_AMOUNTS.map((amt) => (
                <Button key={amt} size="sm" variant="outline" className="text-xs h-7 px-2" disabled={loading} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleZap(amt); }}>
                  {amt.toLocaleString()}
                </Button>
              ))}
            </div>
            {error && (
              <div className="text-xs text-red-500 mt-1.5 px-1">
                {error === "Insufficient balance" ? (
                  <Link href="/settings/wallet" className="underline">Deposit sats →</Link>
                ) : error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Add Lightning Address */}
      {showLnModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowLnModal(false)}>
          <div className="bg-card border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Lightning Wallet Required
              </h3>
              <button onClick={() => setShowLnModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              To send and receive zaps, you need to add a Lightning Address to your profile. 
              This is an address like <span className="font-mono text-foreground">you@coinpayportal.com</span> that lets you send and receive Bitcoin over the Lightning Network.
            </p>
            <div className="flex gap-2">
              <Link href="/profile" className="flex-1">
                <Button className="w-full" variant="default">
                  <Zap className="h-4 w-4 mr-2" />
                  Add Lightning Address
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setShowLnModal(false)}>
                Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
