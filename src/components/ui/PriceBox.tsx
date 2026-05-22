import type { ReactNode } from "react";
import { DollarSign } from "lucide-react";

// Shared "price box" card used on detail pages for paid services (gigs,
// for-hire, bounties, etc.). Matches the sidebar widget on /gigs/[id]:
// dollar icon + 2xl bold amount, optional subtitle, then any meta rows
// (e.g. duration, location) and an action slot.

interface PriceBoxProps {
  amount: string;
  /** Optional small line under the amount, e.g. "Fixed rate" or "Per approval". */
  subtitle?: ReactNode;
  /** Inline content rendered immediately under the amount (e.g. sats-to-USD hint). */
  amountHint?: ReactNode;
  /** Top-right slot for badges or actions like an Edit button. */
  topRight?: ReactNode;
  /** Meta rows + action buttons. Use <PriceBoxRow> for icon+text rows. */
  children?: ReactNode;
  className?: string;
}

export function PriceBox({
  amount,
  subtitle,
  amountHint,
  topRight,
  children,
  className,
}: PriceBoxProps) {
  return (
    <div
      className={`border border-border rounded-lg p-6 bg-card space-y-4 ${className || ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="text-2xl font-bold leading-tight break-words">
            {amount}
          </span>
        </div>
        {topRight && <div className="flex-shrink-0">{topRight}</div>}
      </div>
      {amountHint && <div className="text-sm text-muted-foreground">{amountHint}</div>}
      {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      {children}
    </div>
  );
}

interface PriceBoxRowProps {
  icon?: ReactNode;
  children: ReactNode;
}

export function PriceBoxRow({ icon, children }: PriceBoxRowProps) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
