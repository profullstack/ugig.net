import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";
import type { Database, Json } from "@/types/database";

/**
 * Valid webhook event types
 */
export type WebhookEventType =
  | "application.new"
  | "message.new"
  | "gig.update"
  | "review.new";

const WEBHOOK_TIMEOUT_MS = 10_000; // 10 second timeout

/**
 * Create HMAC-SHA256 signature for a webhook payload
 */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * SSRF protection: validate webhook URL before making request.
 * Blocks private IPs, localhost, and cloud metadata endpoints.
 */
function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTPS in production
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      console.warn(`[webhook] SSRF protection: blocked non-HTTPS URL`);
      return false;
    }

    // Block non-http(s) protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      console.warn(`[webhook] SSRF protection: blocked protocol ${parsed.protocol}`);
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    ) {
      console.warn(`[webhook] SSRF protection: blocked localhost`);
      return false;
    }

    // Block cloud metadata endpoints
    if (
      hostname === "169.254.169.254" || // AWS/GCP metadata
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".internal")
    ) {
      console.warn(`[webhook] SSRF protection: blocked metadata endpoint`);
      return false;
    }

    // Block private IP ranges (basic check for common patterns)
    const ipPatterns = [
      /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12
      /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
      /^0\.0\.0\.0$/, // 0.0.0.0
      /^127\.\d+\.\d+\.\d+$/, // 127.0.0.0/8
    ];

    for (const pattern of ipPatterns) {
      if (pattern.test(hostname)) {
        console.warn(`[webhook] SSRF protection: blocked private IP ${hostname}`);
        return false;
      }
    }

    return true;
  } catch {
    console.warn(`[webhook] SSRF protection: invalid URL`);
    return false;
  }
}

/**
 * Create a Supabase admin client for webhook operations.
 * Uses service role to bypass RLS for cross-user webhook lookups.
 */
function getAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Dispatch a webhook event to all matching active webhooks for a given user.
 *
 * @param userId - The user whose webhooks should be triggered
 * @param eventType - The event type (e.g. 'application.new')
 * @param payload - The event payload to send
 *
 * This function is fire-and-forget — it catches all errors internally
 * and logs delivery results to the webhook_deliveries table.
 */
export async function dispatchWebhook(
  userId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getAdminClient();

    // Find all active webhooks for this user that subscribe to this event type
    const { data: webhooks, error } = await supabase
      .from("webhooks")
      .select("id, url, secret, events")
      .eq("user_id", userId)
      .eq("active", true);

    if (error || !webhooks || webhooks.length === 0) {
      return;
    }

    // Filter to webhooks that subscribe to this event type
    const matchingWebhooks = webhooks.filter((wh) =>
      (wh.events as string[]).includes(eventType)
    );

    if (matchingWebhooks.length === 0) {
      return;
    }

    // Build the envelope
    const envelope = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    };
    const bodyStr = JSON.stringify(envelope);

    // Fire all webhooks concurrently
    const deliveryPromises = matchingWebhooks.map(async (webhook) => {
      let statusCode: number | null = null;
      let responseBody: string | null = null;

      try {
        // SSRF protection: validate URL before making request
        if (!isAllowedWebhookUrl(webhook.url)) {
          statusCode = 0;
          responseBody = "SSRF protection: URL not allowed";
          // Still log the blocked attempt
          await supabase.from("webhook_deliveries").insert({
            webhook_id: webhook.id,
            event_type: eventType,
            payload: envelope as unknown as Json,
            status_code: statusCode,
            response_body: responseBody,
          });
          return;
        }

        const signature = signPayload(bodyStr, webhook.secret);

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          WEBHOOK_TIMEOUT_MS
        );

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": signature,
              "X-Webhook-Event": eventType,
            },
            body: bodyStr,
            signal: controller.signal,
          });

          statusCode = response.status;
          responseBody = await response.text().catch(() => null);

          // Truncate response body to 4KB to avoid bloating the DB
          if (responseBody && responseBody.length > 4096) {
            responseBody = responseBody.slice(0, 4096) + "...[truncated]";
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        statusCode = 0;
        responseBody =
          err instanceof Error ? err.message : "Unknown delivery error";
      }

      // Log delivery
      await supabase.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        event_type: eventType,
        payload: envelope as unknown as Json,
        status_code: statusCode,
        response_body: responseBody,
      });
    });

    // Wait for all deliveries but don't block the caller
    await Promise.allSettled(deliveryPromises);
  } catch (err) {
    // Never let webhook dispatch crash the calling route
    console.error("[webhook dispatch error]", err);
  }
}

/**
 * Fire-and-forget wrapper — does not await the dispatch.
 * Use this in API routes to avoid blocking the response.
 */
export function dispatchWebhookAsync(
  userId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): void {
  dispatchWebhook(userId, eventType, payload).catch((err) =>
    console.error("[webhook async dispatch error]", err)
  );
}
