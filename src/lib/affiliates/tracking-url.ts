export function getAffiliateBaseUrl(requestUrl: string): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin;
}

export function buildAffiliateTrackingUrl(baseUrl: string, trackingCode: string): string {
  const url = new URL("/api/affiliates/click", baseUrl);
  url.searchParams.set("ugig_ref", trackingCode);
  return url.toString();
}
