/**
 * CrawlProof ad slot, rendered inside page content (never at the tail of
 * <body>, which puts it below the footer). The global ad.js loader in the
 * root layout fills every [data-cp-ad] slot in place with a 300x250 iframe.
 */
const CP_AD_SLOT = "9384bcb3-7375-4f33-b671-c73a63bd2b12";

export function AdUnit({ className = "" }: { className?: string }) {
  return (
    <div className={`my-8 flex flex-col items-center ${className}`}>
      <span className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Advertisement
      </span>
      <div
        data-cp-ad=""
        data-slot={CP_AD_SLOT}
        data-format="banner_300x250"
      />
    </div>
  );
}
