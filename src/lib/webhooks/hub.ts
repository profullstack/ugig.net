import { createHmac } from "crypto";
import { Webhooks, type WebhookStore, type WebhooksOptions } from "@profullstack/webhooks";
import { createServiceClient } from "@/lib/supabase/service";
import { supabaseStore, type SupabaseLike } from "./supabase-store";

/**
 * Customer webhooks for ugig.net, on @profullstack/webhooks.
 *
 * Endpoints and a durable outbox live in Supabase (hub_webhook_* tables);
 * `emit` queues, and the drainer started once at server boot
 * (src/instrumentation.ts) sends with retries and backoff.
 *
 * Receivers that were built against the old sender keep working unchanged:
 *  - `X-Webhook-Signature`: bare hex HMAC-SHA256 of the raw body, keyed with
 *    the secret string exactly as shown to the customer (UTF-8 bytes, also
 *    for new `whsec_` secrets, which is what the settings page documents);
 *  - `X-Webhook-Event`: the event type;
 *  - `content-type: application/json`;
 *  - the body still carries `event`, `timestamp` and `data` at the top level,
 *    next to the CloudEvents attributes (`type`, `time`, `id`, `source`, ...).
 * New receivers verify the Standard Webhooks `webhook-signature` header.
 */

/** The events ugig emits. Names kept from the old sender so existing subscriptions still match. */
export const WEBHOOK_EVENT_TYPES = [
  "application.new",
  "message.new",
  "gig.update",
  "review.new",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_SOURCE = "https://ugig.net";

/** The old ugig signature: hex HMAC-SHA256 of the body, keyed with the secret's UTF-8 bytes. */
export function legacySignature(body: string, secret: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(body).digest("hex");
}

/** Headers the old sender put on every delivery, sent next to the Standard Webhooks ones. */
export const legacyHeaders: NonNullable<WebhooksOptions["extraHeaders"]> = ({ body, secret, eventType }) => ({
  "content-type": "application/json",
  "X-Webhook-Signature": legacySignature(body, secret),
  "X-Webhook-Event": eventType,
});

/**
 * Add the old envelope's top-level `event` and `timestamp` to each queued
 * CloudEvent, so a receiver reading `body.event` / `body.timestamp` / `body.data`
 * sees what it always did. Both are valid CloudEvents extension attribute names.
 */
export function withLegacyEnvelope(store: WebhookStore): WebhookStore {
  return {
    ...store,
    insertDeliveries: (rows) =>
      store.insertDeliveries(
        rows.map((d) => {
          try {
            const ev = JSON.parse(d.payload);
            if (ev && typeof ev === "object" && !("event" in ev)) {
              return { ...d, payload: JSON.stringify({ ...ev, event: ev.type, timestamp: ev.time }) };
            }
          } catch {
            // not JSON: send as is
          }
          return d;
        }),
      ),
  };
}

export function createHooks(
  store: WebhookStore,
  options: Partial<WebhooksOptions> = {},
): Webhooks {
  return new Webhooks({
    store: withLegacyEnvelope(store),
    source: WEBHOOK_SOURCE,
    eventTypes: [...WEBHOOK_EVENT_TYPES],
    maxEndpoints: 10,
    extraHeaders: legacyHeaders,
    guard: process.env.NODE_ENV === "production" ? {} : { allowHttp: true },
    log: (m) => console.warn(`[webhooks] ${m}`),
    ...options,
  });
}

const KEY = Symbol.for("ugig.webhooks.hub");
type HubGlobal = typeof globalThis & { [KEY]?: Webhooks };

/**
 * The process-wide hub. Kept on globalThis because Next bundles route handlers
 * and instrumentation separately: a module-level singleton would give each its
 * own instance, and only the one that called start() would drain.
 */
export function getHooks(): Webhooks {
  const g = globalThis as HubGlobal;
  if (!g[KEY]) {
    g[KEY] = createHooks(supabaseStore(createServiceClient() as unknown as SupabaseLike));
  }
  return g[KEY]!;
}

/** Start the background drainer once per server process. */
export function startWebhooks(): void {
  getHooks().start();
}
