import { PackageCheck, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sellerTrustLabel, type SellerTrust } from "@/lib/trust/seller-trust";

/**
 * "New seller" / "14 delivered · 92% on time" for whoever does the work
 * (for-hire sellers, profiles). Renders nothing when trust is unknown.
 */
export function SellerTrustBadge({
  trust,
  className = "",
}: {
  trust?: SellerTrust | null;
  className?: string;
}) {
  if (!trust) return null;
  const title = trust.new_seller
    ? "No delivered work on ugig yet"
    : trust.on_time_rate === null
      ? `${trust.delivered_count} paid or delivered jobs on ugig. On-time rate shows after 3 Buy-now orders with a deadline.`
      : `${trust.delivered_count} paid or delivered jobs on ugig; ${trust.on_time_count} of ${trust.on_time_measured} Buy-now orders delivered before the escrow deadline.`;
  return (
    <Badge
      variant="outline"
      title={title}
      data-testid="seller-trust"
      className={`font-medium flex items-center gap-1 ${
        trust.new_seller ? "text-muted-foreground" : "border-green-600/40 text-green-700 dark:text-green-300"
      } ${className}`}
    >
      {trust.new_seller ? <Sparkles className="h-3 w-3" /> : <PackageCheck className="h-3 w-3" />}
      {sellerTrustLabel(trust)}
    </Badge>
  );
}

/** Shown on hiring posts whose poster has paid someone on ugig. */
export function VerifiedPosterBadge({
  trust,
  className = "",
}: {
  trust?: SellerTrust | null;
  className?: string;
}) {
  if (!trust?.verified_poster) return null;
  return (
    <Badge
      variant="outline"
      title={
        trust.paid_count > 0
          ? `Has paid for ${trust.paid_count} job${trust.paid_count === 1 ? "" : "s"} on ugig`
          : "Verified by ugig"
      }
      data-testid="verified-poster"
      className={`font-medium flex items-center gap-1 border-blue-500/40 text-blue-700 dark:text-blue-300 ${className}`}
    >
      <ShieldCheck className="h-3 w-3" />
      Verified poster
    </Badge>
  );
}
