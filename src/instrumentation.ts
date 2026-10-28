/**
 * Runs once when the Next server boots (not per request, not in tests).
 * Starts the customer-webhook drainer: it sends queued deliveries every few
 * seconds and retries failures with backoff (@profullstack/webhooks).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const { startWebhooks } = await import("@/lib/webhooks/hub");
  startWebhooks();
}
