"use client";

import { useEffect, useState } from "react";

let cachedRate: { rate: number; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function getBtcRate(): Promise<number | null> {
  if (cachedRate && Date.now() - cachedRate.ts < CACHE_MS) {
    return cachedRate.rate;
  }
  try {
    const res = await fetch("/api/rates/btc");
    const data = await res.json();
    if (data.rate) {
      cachedRate = { rate: data.rate, ts: Date.now() };
      return data.rate;
    }
  } catch {}
  return cachedRate?.rate ?? null;
}

function satsToUsd(sats: number, btcPrice: number): string {
  const usd = (sats / 100_000_000) * btcPrice;
  if (usd < 0.01) return "<$0.01";
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 1000) return `$${usd.toFixed(0)}`;
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

interface SatsToUsdProps {
  sats: number;
  className?: string;
}

export function SatsToUsd({ sats, className }: SatsToUsdProps) {
  const [usd, setUsd] = useState<string | null>(null);

  useEffect(() => {
    getBtcRate().then((rate) => {
      if (rate) setUsd(satsToUsd(sats, rate));
    });
  }, [sats]);

  if (!usd) return null;

  return (
    <span className={className || "text-xs text-muted-foreground"}>
      ≈ {usd} USD
    </span>
  );
}

interface SatsRangeToUsdProps {
  min: number | null;
  max: number | null;
  className?: string;
}

export function SatsRangeToUsd({ min, max, className }: SatsRangeToUsdProps) {
  const [usdMin, setUsdMin] = useState<string | null>(null);
  const [usdMax, setUsdMax] = useState<string | null>(null);

  useEffect(() => {
    getBtcRate().then((rate) => {
      if (rate) {
        if (min) setUsdMin(satsToUsd(min, rate));
        if (max) setUsdMax(satsToUsd(max, rate));
      }
    });
  }, [min, max]);

  if (!usdMin && !usdMax) return null;

  const display = usdMin && usdMax
    ? `≈ ${usdMin} - ${usdMax} USD`
    : usdMin
    ? `≈ ${usdMin}+ USD`
    : `≈ up to ${usdMax} USD`;

  return (
    <span className={className || "text-xs text-muted-foreground"}>
      {display}
    </span>
  );
}
