import { CheckCircle2, EyeOff } from "lucide-react";
import { getListingStatus, type ListingStatusProfile } from "@/lib/listing-status";

const PEOPLE_FIX: Record<string, string> = {
  email_confirmed: "Confirm your email with the link ugig sent you (check spam), or request a new one from the login page.",
  spam_review:
    "Your account is held for spam review, usually because the username looks random. Pick a readable username below, or email hello@ugig.net.",
  bio_or_skills: "Add a bio or at least one skill below.",
};

/**
 * "Listed" / "Not listed yet: missing X" for the signed-in user's own profile,
 * from the same rule the listing queries use (lib/listing-status.ts).
 */
export function ListingStatusCard({ profile }: { profile: ListingStatusProfile }) {
  const status = getListingStatus(profile);

  if (status.discoverable) {
    return (
      <div
        data-testid="listing-status"
        className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm"
      >
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
        <span>{status.message}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="listing-status"
      className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <EyeOff className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
        <span>{status.message}</span>
      </p>
      <ul className="list-disc pl-8 text-muted-foreground space-y-1">
        {status.missing_for_listing.map((m) => (
          <li key={m}>{PEOPLE_FIX[m]}</li>
        ))}
      </ul>
      <p className="pl-6 text-xs text-muted-foreground">
        Directory: {status.listed_in.directory ? "listed" : "hidden"} · Search:{" "}
        {status.listed_in.search ? "listed" : "hidden"}
      </p>
    </div>
  );
}
