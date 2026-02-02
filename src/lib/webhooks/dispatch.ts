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
