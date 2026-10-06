"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SatsAmount } from "@/components/ui/SatsAmount";
import { Input } from "@/components/ui/input";
import { PLATFORM_FEE_RATE } from "@/lib/constants";
import { formatFeeRate, zapFeeSplit } from "@/lib/fees";

interface SkillZapButtonProps {
  listingId: string;
  sellerId: string;
  initialZapsTotal: number;
}

export function SkillZapButton({
  listingId,
  sellerId,
  initialZapsTotal,
}: SkillZapButtonProps) {
  const [zapsTotal, setZapsTotal] = useState(initialZapsTotal);
  const [showInput, setShowInput] = useState(false);
  const [amount, setAmount] = useState("21");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleZap() {
    const sats = parseInt(amount);
    if (!sats || sats <= 0) {
      setError("Enter a positive amount");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/wallet/zap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_id: sellerId,
          amount_sats: sats,
          target_type: "skill",
          target_id: listingId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Zap failed");
        return;
      }

      setZapsTotal((prev) => prev + sats);
      setSuccess(true);
      setShowInput(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Zap failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowInput(!showInput)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            success
              ? "bg-amber-500/20 text-amber-500"
              : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
          }`}
        >
          <Zap className={`h-4 w-4 ${success ? "fill-amber-500" : ""}`} />
          {success ? "Zapped!" : "Zap"}
        </button>
        {zapsTotal > 0 && (
          <span className="text-sm text-amber-500 font-medium">
            ⚡ <SatsAmount sats={zapsTotal} />
          </span>
        )}
      </div>

      {showInput && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="sats"
            className="w-24 text-sm"
          />
          <div className="flex gap-1">
            {[21, 100, 500, 1000].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className={`px-2 py-1 text-xs rounded border border-border hover:bg-muted transition-colors ${
                  amount === String(preset) ? "bg-muted" : ""
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={handleZap}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {loading ? "..." : "⚡ Send"}
          </Button>
        </div>
      )}

      {showInput && parseInt(amount) > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="zap-fee-note">
          You pay {parseInt(amount).toLocaleString()} sats. {formatFeeRate(PLATFORM_FEE_RATE)} platform
          fee ({zapFeeSplit(parseInt(amount)).feeSats.toLocaleString()} sats): the seller receives{" "}
          {zapFeeSplit(parseInt(amount)).recipientSats.toLocaleString()} sats.
        </p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
