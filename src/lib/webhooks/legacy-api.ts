import { NextResponse } from "next/server";
import { WebhookError, type PublicDelivery, type PublicEndpoint } from "@profullstack/webhooks";

/**
 * The original /api/webhooks shapes, kept so existing API clients and older
 * ugig CLIs keep working. New code uses /api/v1/webhooks.
 */

export interface LegacyWebhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  secret?: string;
}

export function toLegacyWebhook(e: PublicEndpoint, secret?: string): LegacyWebhook {
  return {
    id: e.id,
    url: e.url,
    events: e.events,
    active: e.enabled,
    created_at: e.created_at,
    updated_at: e.updated_at,
    ...(secret ? { secret } : {}),
  };
}

export function toLegacyDelivery(d: PublicDelivery) {
  return {
    id: d.id,
    webhook_id: d.endpoint_id,
    event_type: d.event_type,
    payload: d.payload ?? {},
    status: d.status,
    attempts: d.attempts,
    status_code: d.last_status,
    response_body: d.last_error,
    created_at: d.created_at,
  };
}

/** A hub error as the old routes answered: `{ error }` with its status. */
export function legacyError(err: unknown): NextResponse {
  if (err instanceof WebhookError) {
    const status = err.status === 409 ? 400 : err.status;
    const message = err.status === 409 ? "Maximum of 10 webhooks allowed per user" : err.message;
    return NextResponse.json({ error: message === "no such webhook endpoint" ? "Webhook not found" : message }, { status });
  }
  console.error("[webhooks]", err);
  return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
}
