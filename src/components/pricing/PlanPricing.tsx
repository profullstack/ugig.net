import { Check } from "lucide-react";
import {
  FUNDING_LIFETIME_THRESHOLD_USD,
  LIFETIME_PRICE_USD,
  PRICE_RAILS_COPY,
  PRO_ANNUAL_PRICE_USD,
  PRO_MONTHLY_PRICE_USD,
  formatUsd,
} from "@/lib/plans";

/** Pro price block: monthly headline, then the annual and lifetime options. All crypto, via CoinPay. */
export function ProPriceDetails({ headlineClassName = "text-4xl font-bold mb-1" }: { headlineClassName?: string }) {
  return (
    <>
      <p className={headlineClassName}>
        {formatUsd(PRO_MONTHLY_PRICE_USD)}
        <span className="text-lg font-normal text-muted-foreground">/month</span>
      </p>
      <p className="text-sm text-muted-foreground mb-2">
        Paid in {PRICE_RAILS_COPY.monthly}
      </p>
      <p className="text-sm text-muted-foreground mb-1">
        or {formatUsd(PRO_ANNUAL_PRICE_USD)}/year
      </p>
      <p className="text-sm text-primary mb-1 font-medium">
        Lifetime membership: {formatUsd(LIFETIME_PRICE_USD)} one-time
      </p>
      <p className="text-sm text-green-600 dark:text-green-400 mb-6 font-semibold">
        Fund ugig.net {formatUsd(FUNDING_LIFETIME_THRESHOLD_USD)}+ and lifetime is included free
      </p>
    </>
  );
}

export function PerkList({
  perks,
  leading,
  className = "text-left space-y-3",
}: {
  perks: readonly string[];
  leading?: readonly string[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {[...(leading ?? []), ...perks].map((perk) => (
        <li key={perk} className="flex items-center gap-3">
          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
          <span>{perk}</span>
        </li>
      ))}
    </ul>
  );
}
