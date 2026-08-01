/**
 * Outbound pacing and retry for CoinPayPortal API calls.
 *
 * CoinPayPortal rate-limits *every* `/api/` route to 60 requests per rolling
 * minute per client IP. ugig.net talks to it from a single server IP, so that
 * budget is shared by every payment request, status poll and webhook replay the
 * box makes — for all users at once. A bulk pay of 62 invoices fires 62 create
 * calls, which alone exhausts the minute in seconds.
 *
 * A 429 is transient by definition: it clears when the window rolls. Treating
 * one as a terminal error is what turned a whole payroll run into 30 invoices
 * reported as un-payable. So every CoinPay call goes through here, which:
 *
 *   1. paces requests to stay inside the provider's window, and
 *   2. retries the ones that get limited anyway, honouring `Retry-After`.
 *
 * The counters are per-process. `railway.json` pins `numReplicas: 1`, so one
 * process is the whole outbound budget; if that ever scales out, lower
 * `COINPAY_MAX_REQUESTS_PER_MINUTE` to this value divided by the replica count,
 * because the provider counts the replicas together and we cannot see across
 * them.
 */

const WINDOW_MS = 60_000;

/**
 * Requests we allow ourselves per rolling minute. Deliberately under the
 * provider's 60 so single-invoice payments, status polls and OAuth calls
 * sharing this IP still fit while a bulk run is in flight.
 */
const MAX_PER_WINDOW = positiveInt(process.env.COINPAY_MAX_REQUESTS_PER_MINUTE, 45);

/** Total attempts per call, including the first. */
const MAX_ATTEMPTS = positiveInt(process.env.COINPAY_MAX_ATTEMPTS, 4);

/**
 * Fraction of the window background work may consume. Status polls are
 * disposable — webhooks are the real source of truth for settlement — so they
 * must leave room for the payment creations a user is actually waiting on.
 */
const BACKGROUND_SHARE = 0.5;

/** How long a single call may spend waiting before it gives up. */
const DEFAULT_BUDGET_MS = 120_000;

/** Cap on any single sleep, so a wild `Retry-After` cannot park us for hours. */
const MAX_SLEEP_MS = 65_000;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Raised when a call could not be made within its time budget because the
 * provider's rate limit was saturated. Distinct from a provider rejection: the
 * request is still valid and will succeed once the window rolls.
 */
export class CoinpayRateLimitError extends Error {
  readonly retryable = true;

  constructor(message = "CoinPay rate limit reached — try again in a minute") {
    super(message);
    this.name = "CoinpayRateLimitError";
  }
}

export function isCoinpayRateLimitError(error: unknown): boolean {
  return error instanceof CoinpayRateLimitError;
}

// ── Rolling-window state ───────────────────────────────────────────────────

/** Timestamps of the requests we have issued inside the current window. */
let issuedAt: number[] = [];

/**
 * Set when the provider tells us we are over the limit. Our own accounting is
 * optimistic — it cannot see traffic from other parts of the app — so their
 * answer overrides it until the stated reset.
 */
let blockedUntil = 0;

/** Serializes slot reservation so two callers cannot claim the same last slot. */
let gate: Promise<void> = Promise.resolve();

/** Test seam: drop all pacing state. */
export function resetCoinpayThrottle(): void {
  issuedAt = [];
  blockedUntil = 0;
  gate = Promise.resolve();
}

/**
 * Run `fn` with the reservation lock held. The lock guards the *decision* only —
 * never a sleep. Holding it across a wait would make N waiting callers drain
 * serially instead of concurrently, so a burst of background polls could park an
 * interactive request behind minutes of other people's sleeps.
 */
async function withGate<T>(fn: () => T): Promise<T> {
  const previous = gate;
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return fn();
  } finally {
    release();
  }
}

/**
 * Try to claim one slot in the rolling window. Returns 0 on success, or the
 * milliseconds to wait before it is worth trying again.
 */
function tryClaim(interactive: boolean): number {
  const now = Date.now();
  issuedAt = issuedAt.filter((at) => now - at < WINDOW_MS);

  // Background work may only spend part of the budget. Without this a page
  // polling 80 invoices every 5s consumes every slot and an actual payment can
  // never be created — the poll is disposable, the payment is not.
  const ceiling = interactive ? MAX_PER_WINDOW : Math.floor(MAX_PER_WINDOW * BACKGROUND_SHARE);

  const windowWait = issuedAt.length < ceiling ? 0 : issuedAt[0]! + WINDOW_MS - now;
  const wait = Math.max(windowWait, blockedUntil - now);

  if (wait <= 0) {
    issuedAt.push(now);
    return 0;
  }
  return wait;
}

/**
 * Take one slot in the rolling window, waiting for the window to roll if the
 * budget is spent. Throws if waiting would run past `deadline`.
 */
async function reserveSlot(deadline: number, interactive: boolean): Promise<void> {
  for (;;) {
    const wait = await withGate(() => tryClaim(interactive));
    if (wait <= 0) return;
    if (Date.now() + wait > deadline) throw new CoinpayRateLimitError();
    // Slept outside the lock, so every waiter waits concurrently and they all
    // re-contend when the window rolls.
    await sleep(Math.min(wait, MAX_SLEEP_MS));
  }
}

// ── Retry ──────────────────────────────────────────────────────────────────

/** How long the provider says to wait, from whichever header it sent. */
function providerWaitMs(response: Response): number | null {
  // Partial `Response` stand-ins do not always carry headers; without them we
  // just fall back to backoff.
  const headers: Headers | undefined = response.headers;
  if (!headers) return null;

  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }

  const reset = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now());
  }

  return null;
}

/** Exponential backoff with jitter, for when the provider tells us nothing. */
function backoffMs(attempt: number): number {
  return Math.min(MAX_SLEEP_MS, 1000 * 2 ** (attempt - 1)) * (1 + Math.random() * 0.25);
}

export interface CoinpayFetchOptions {
  /**
   * Epoch ms after which we stop waiting and surface the failure. Callers
   * preparing many payments should share one deadline so the batch as a whole
   * stays bounded — quotes minted early must still be live at the end.
   */
  deadline?: number;
  /** Short label for logs, e.g. `payments/create`. */
  label?: string;
  /**
   * Disposable work nobody is waiting on — a status poll that will run again in
   * seconds, where a webhook is the authoritative answer anyway. Background
   * calls never queue: if no slot is free right now they fail immediately, so a
   * poll storm cannot delay a payment. They also get a smaller slice of the
   * window (see `BACKGROUND_SHARE`) and are not retried.
   */
  background?: boolean;
}

/**
 * `fetch` for CoinPayPortal: paced against the provider's rolling limit, and
 * retried on 429 or a 5xx.
 *
 * Returns the final `Response` untouched — including a last-attempt 429 — so
 * callers keep their existing error handling. Only exhausting the time budget
 * before a request could even be sent throws (`CoinpayRateLimitError`), because
 * that is the one case with no response to hand back.
 */
export async function coinpayFetch(
  url: string,
  init?: RequestInit,
  options: CoinpayFetchOptions = {}
): Promise<Response> {
  const background = options.background ?? false;
  // Background work never waits and never retries: it is cheaper to skip a poll
  // than to hold a slot someone's payment needs. It runs again in seconds.
  const maxAttempts = background ? 1 : MAX_ATTEMPTS;
  const deadline = background
    ? Date.now()
    : (options.deadline ?? Date.now() + DEFAULT_BUDGET_MS);
  const label = options.label ?? url;

  for (let attempt = 1; ; attempt++) {
    await reserveSlot(deadline, !background);

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      // A dropped connection mid-batch is as transient as a 429 and just as
      // wrong to record as "this invoice cannot be paid".
      const wait = backoffMs(attempt);
      if (attempt >= maxAttempts || Date.now() + wait > deadline) throw err;
      console.warn(`[coinpay] ${label} attempt ${attempt} failed: ${String(err)}`);
      await sleep(wait);
      continue;
    }

    // Only replay when we can positively identify a transient failure. A
    // response we cannot classify is handed back untouched — re-sending a
    // payment creation on a guess is far worse than surfacing it once.
    const status = typeof response.status === "number" ? response.status : 0;
    if (status !== 429 && status < 500) return response;

    const wait = providerWaitMs(response) ?? backoffMs(attempt);
    if (status === 429) {
      // Their count is authoritative; hold every other caller off too.
      blockedUntil = Math.max(blockedUntil, Date.now() + wait);
    }

    if (attempt >= maxAttempts || Date.now() + wait > deadline) return response;

    // Drain before sleeping so the socket is not held open for the wait.
    await Promise.resolve(response.text?.()).catch(() => "");
    console.warn(
      `[coinpay] ${label} got ${status}, retrying in ${Math.round(wait)}ms ` +
        `(attempt ${attempt}/${maxAttempts})`
    );
    await sleep(Math.min(wait, MAX_SLEEP_MS));
  }
}
