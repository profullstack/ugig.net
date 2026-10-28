import { getHooks, type WebhookEventType } from "./hub";

export type { WebhookEventType } from "./hub";

/** What an event is about, for the CloudEvents `subject` (gig:<id>, application:<id>, ...). */
export function subjectFor(payload: Record<string, unknown>): string | undefined {
  for (const key of ["application_id", "message_id", "review_id", "gig_id", "conversation_id"]) {
    const v = payload[key];
    if (typeof v === "string" && v) return `${key.replace(/_id$/, "")}:${v}`;
  }
  return undefined;
}

/**
 * Queue a webhook event for every enabled endpoint of `userId` that subscribes
 * to it. Delivery (signing, retries, the delivery log) is done by the
 * @profullstack/webhooks drainer; this only writes to the outbox.
 *
 * Never throws: a webhook problem must not fail the route that emitted it.
 */
export async function dispatchWebhook(
  userId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await getHooks().emit(userId, eventType, payload, { subject: subjectFor(payload) });
  } catch (err) {
    console.error("[webhook dispatch error]", err);
  }
}

/** Fire-and-forget wrapper: does not await the outbox write. */
export function dispatchWebhookAsync(
  userId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): void {
  void dispatchWebhook(userId, eventType, payload);
}
