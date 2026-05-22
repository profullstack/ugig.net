"use client";

import { PAYMENT_COINS, SATS_COINS } from "@/types";

// Shared coin + amount inputs used wherever a paid-service form lets the user
// pick a payout currency and an amount: gigs, for-hire, bounties, etc.
// The amount is denominated in USD unless the coin is a sats variant.

interface PaymentCoinSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  includeBlank?: boolean;
  blankLabel?: string;
  className?: string;
}

export function PaymentCoinSelect({
  value,
  onChange,
  id,
  disabled,
  includeBlank = true,
  blankLabel = "Select coin...",
  className,
}: PaymentCoinSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={
        className ||
        "w-full border border-input rounded-md px-3 py-2 bg-background"
      }
    >
      {includeBlank && <option value="">{blankLabel}</option>}
      {PAYMENT_COINS.map((coin) => (
        <option key={coin} value={coin}>
          {coin}
        </option>
      ))}
    </select>
  );
}

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  coin?: string | null;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** When true, treats per-unit / fractional pricing styles (step=0.01). */
  fractional?: boolean;
  min?: string;
  step?: string;
}

export function AmountInput({
  value,
  onChange,
  coin,
  id,
  disabled,
  placeholder,
  className,
  fractional = false,
  min,
  step,
}: AmountInputProps) {
  const isSats = !!coin && SATS_COINS.has(coin);
  const resolvedStep = step ?? (isSats ? "1" : fractional ? "0.01" : "1");
  const resolvedPlaceholder =
    placeholder ?? (isSats ? "e.g. 50000" : "0");
  return (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      min={min ?? "0"}
      step={resolvedStep}
      placeholder={resolvedPlaceholder}
      className={
        className ||
        "w-full border border-input rounded-md px-3 py-2 bg-background"
      }
    />
  );
}

/**
 * Convenience wrapper bundling coin + amount with sensible labels — use this
 * when a form needs a single fixed payment (e.g. bounty payout). Forms with
 * budget ranges should use PaymentCoinSelect + AmountInput directly.
 */
interface PaymentInputProps {
  coin: string;
  onCoinChange: (coin: string) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  amountLabel?: string;
  coinLabel?: string;
  disabled?: boolean;
}

export function PaymentInput({
  coin,
  onCoinChange,
  amount,
  onAmountChange,
  amountLabel = "Amount (USD)",
  coinLabel = "Payment coin",
  disabled,
}: PaymentInputProps) {
  const isSats = !!coin && SATS_COINS.has(coin);
  const effectiveLabel = isSats
    ? amountLabel.replace(/\bUSD\b/i, "sats")
    : amountLabel;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-sm font-medium">{effectiveLabel}</label>
        <AmountInput
          value={amount}
          onChange={onAmountChange}
          coin={coin}
          disabled={disabled}
          fractional
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">{coinLabel}</label>
        <PaymentCoinSelect
          value={coin}
          onChange={onCoinChange}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank for fiat / negotiable.
        </p>
      </div>
    </div>
  );
}
