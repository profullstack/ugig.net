/**
 * CrawlProof ad slot, rendered inside page content (never at the tail of
 * <body>, which puts it below the footer, and never on the homepage). The
 * global ad.js loader in the root layout fills every [data-cp-ad] slot in
 * place with a thin text_link line that carries its own "Sponsored" mark.
 */
const CP_AD_SLOT = "9384bcb3-7375-4f33-b671-c73a63bd2b12";

export function AdUnit({ className = "" }: { className?: string }) {
  return (
    <div
      className={`my-2 w-full ${className}`}
      data-cp-ad=""
      data-slot={CP_AD_SLOT}
      data-format="text_link"
    />
  );
}
