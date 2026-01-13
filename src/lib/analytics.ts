/**
 * Analytics utilities for tracking events
 */

declare global {
  interface Window {
    datafast?: (event: string, data?: Record<string, unknown>) => void;
  }
}

/**
 * Track a Datafast analytics event
 */
export function trackEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.datafast) {
    window.datafast(event, data);
  }
}

/**
 * Track checkout initiation (for Stripe integration)
 */
export function trackCheckout(data: {
  name?: string;
  email?: string;
  product_id?: string;
}) {
  trackEvent("initiate_checkout", data);
}

/**
 * Track signup completion
 */
export function trackSignup(data: { email?: string; username?: string }) {
  trackEvent("signup", data);
}

/**
 * Track gig creation
 */
export function trackGigCreated(data: { gig_id?: string; category?: string }) {
  trackEvent("gig_created", data);
}

/**
 * Track application submission
 */
export function trackApplicationSubmitted(data: {
  gig_id?: string;
  application_id?: string;
}) {
  trackEvent("application_submitted", data);
}
